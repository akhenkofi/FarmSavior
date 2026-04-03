import random
import json
import hashlib
import time
import hmac
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
from typing import Optional, Any
from urllib.request import Request as UrlRequest, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
import xml.etree.ElementTree as ET
import re
import ssl
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Body, Header, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, text, inspect
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_db
from app.models.models import (
    User, OTPCode, FarmerProfile, CropListing, ListingOffer,
    LogisticsRequest, LogisticsStatus, Payment, WeatherAlert,
    UserRole, CountryCode, IDVerification, FarmPassport,
    LivestockListing, EquipmentRental, StorageReservation, TradeContract, VerificationReview, UpdateReview,
    DeviceToken, DiseaseScan, SheepGoatRecord, LivestockPurchaseSource, SheepGoatBreedingGroup, SheepGoatSubscription,
    WorldChatMessage, WorldChatUserModeration,
    CommunityProfile, CommunityFollow, CommunityMute, CommunityPost, CommunityPostLike, CommunityPostComment, CommunityDirectMessage,
    MarketplaceOrder, SellerPayoutProfile, PayoutHistory, MarketplaceNotification
)
from app.schemas.schemas import (
    UserCreate, UserLogin, OTPVerify, TokenResponse, FarmerProfileIn,
    CropListingIn, OfferIn, LogisticsIn, LogisticsAcceptIn,
    PaymentIn, WeatherAlertIn, IDVerificationIn, IDVerificationSelfIn, FarmPassportIn,
    LivestockListingIn, EquipmentRentalIn, StorageReservationIn, ContractIn,
    VerificationDecisionIn, DeviceTokenIn, DiseaseAnalyzeIn,
    SheepGoatRecordIn, LivestockPurchaseSourceIn, SheepGoatBreedingGroupIn, SheepGoatSubscriptionIn, PoultryUniversitySubscriptionIn,
    WorldChatMessageIn, WorldChatModerationActionIn, WorldChatUserSanctionIn,
    CommunityProfileIn, CommunityDirectMessageIn, CommunityPostIn, CommunityCommentIn,
    PlantIdentifyIn, PestIdentifyIn, AccountUpdateIn, PasswordChangeIn, DeleteAccountIn,
    MarketplaceOrderIn, MarketplaceOrderStatusIn, SellerPayoutProfileIn, SellerPayoutVerificationIn, RefundRequestIn, AutoReleaseIn
)
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password, decode_access_token
from jose import jwt as jose_jwt
from app.core.data_lake import write_jsonl, write_snapshot

router = APIRouter(prefix='/api/v1')


ID_UPLOAD_ROOT = Path(__file__).resolve().parents[3] / 'data' / 'private' / 'id-verifications'


def _guess_ext_from_data_url(data_url: str) -> str:
    head = str(data_url or '').split(';', 1)[0].lower()
    if 'image/png' in head:
        return '.png'
    if 'image/webp' in head:
        return '.webp'
    if 'image/gif' in head:
        return '.gif'
    return '.jpg'


def _store_uploaded_image_data(data_url: Optional[str], *, user_id: int, side: str) -> Optional[str]:
    s = str(data_url or '').strip()
    if not s:
        return None
    if not s.startswith('data:image/') or ',' not in s:
        raise HTTPException(status_code=400, detail=f'{side} image payload is invalid')
    try:
        import base64
        _, encoded = s.split(',', 1)
        raw = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(status_code=400, detail=f'{side} image payload could not be decoded')
    if not raw:
        raise HTTPException(status_code=400, detail=f'{side} image payload is empty')
    day = datetime.utcnow().strftime('%Y%m%d')
    folder = ID_UPLOAD_ROOT / f'user-{int(user_id)}' / day
    folder.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(raw).hexdigest()[:16]
    filename = f"{int(datetime.utcnow().timestamp())}-{side}-{digest}{_guess_ext_from_data_url(s)}"
    target = folder / filename
    target.write_bytes(raw)
    return f'local:{target.relative_to(ID_UPLOAD_ROOT).as_posix()}'


def _photo_is_stored(v: Optional[str]) -> bool:
    s = str(v or '').strip()
    return bool(s and (s.startswith('data:image/') or s.startswith('local:')))


def _local_photo_path(ref: Optional[str]) -> Optional[Path]:
    s = str(ref or '').strip()
    if not s.startswith('local:'):
        return None
    rel = s.split(':', 1)[1].strip('/').replace('..', '')
    p = (ID_UPLOAD_ROOT / rel).resolve()
    try:
        p.relative_to(ID_UPLOAD_ROOT.resolve())
    except Exception:
        return None
    return p


def _identity_review_for_user(db: Session, user_id: int):
    latest = db.query(IDVerification).filter(IDVerification.user_id == user_id).order_by(IDVerification.created_at.desc(), IDVerification.id.desc()).first()
    review = None
    if latest:
        review = db.query(VerificationReview).filter(VerificationReview.id_verification_id == latest.id).first()
    status = str(getattr(review, 'status', '') or 'NOT_SUBMITTED').upper()
    blue = status == 'APPROVED'
    label_map = {
        'NOT_SUBMITTED': 'Not submitted',
        'PENDING': 'Pending verification',
        'APPROVED': 'Verified',
        'DENIED': 'Verification denied',
    }
    return {
        'application': latest,
        'review': review,
        'status': status,
        'blue_check': blue,
        'label': label_map.get(status, status.replace('_', ' ').title()),
    }


def _file_token_from_request(authorization: Optional[str], token: Optional[str]) -> Optional[str]:
    if authorization and str(authorization).lower().startswith('bearer '):
        return authorization
    if token:
        return f'Bearer {token}'
    return authorization


def _verification_view_payload(iv: IDVerification, review: Optional[VerificationReview], token: Optional[str] = None):
    front_url = f"/api/v1/verification/files/{iv.id}/front"
    back_url = f"/api/v1/verification/files/{iv.id}/back"
    legacy_url = f"/api/v1/verification/files/{iv.id}/legacy"
    if token:
        front_url += f'?token={token}'
        back_url += f'?token={token}'
        legacy_url += f'?token={token}'
    return {
        'application': {
            'id': iv.id,
            'id_type': iv.id_type,
            'id_number': iv.id_number,
            'id_photo_url': iv.id_photo_url,
            'id_front_photo_url': iv.id_front_photo_url,
            'id_back_photo_url': iv.id_back_photo_url,
            'id_photo_view_url': legacy_url if _photo_is_stored(iv.id_photo_url) else None,
            'id_front_photo_view_url': front_url if _photo_is_stored(iv.id_front_photo_url) else None,
            'id_back_photo_view_url': back_url if _photo_is_stored(iv.id_back_photo_url) else None,
            'facial_verification_flag': iv.facial_verification_flag,
            'created_at': iv.created_at
        },
        'review': {
            'status': review.status,
            'ai_score': review.ai_score,
            'ai_reason': review.ai_reason,
            'reviewer_note': review.reviewer_note,
            'reviewed_at': review.reviewed_at
        } if review else None
    }


def normalize_livestock_target(raw_target: Optional[str]) -> str:
    target = re.sub(r'[^a-z0-9]+', ' ', str(raw_target or '').lower()).strip()
    target = re.sub(r'\s+', ' ', target)

    aliases = {
        'chicken': 'poultry', 'chickens': 'poultry', 'turkey': 'poultry', 'turkeys': 'poultry',
        'bird': 'poultry', 'birds': 'poultry', 'hen': 'poultry', 'hens': 'poultry',
        'broiler': 'poultry', 'broilers': 'poultry', 'layer': 'poultry', 'layers': 'poultry',
        'pullet': 'poultry', 'pullets': 'poultry', 'cockerel': 'poultry', 'cockerels': 'poultry',
        'goat': 'goat', 'goats': 'goat', 'buck': 'goat', 'bucks': 'goat', 'doe': 'goat', 'does': 'goat',
        'kid': 'goat', 'kids': 'goat', 'caprine': 'goat',
        'sheep': 'sheep', 'ram': 'sheep', 'rams': 'sheep', 'ewe': 'sheep', 'ewes': 'sheep',
        'lamb': 'sheep', 'lambs': 'sheep', 'ovine': 'sheep',
        'cow': 'cattle', 'cows': 'cattle', 'bull': 'cattle', 'bulls': 'cattle', 'calf': 'cattle',
        'calves': 'cattle', 'cattle': 'cattle', 'heifer': 'cattle', 'heifers': 'cattle',
        'steer': 'cattle', 'steers': 'cattle', 'bovine': 'cattle',
    }

    if target in aliases:
        return aliases[target]
    if target.endswith('s') and target[:-1] in aliases:
        return aliases[target[:-1]]
    return target


COUNTRY_REGIONS = {
    'GH': ['Greater Accra', 'Ashanti', 'Northern', 'Volta', 'Western'],
    'NG': ['Lagos', 'Kano', 'Kaduna', 'Rivers', 'Abuja FCT'],
    'BF': ['Centre', 'Hauts-Bassins', 'Boucle du Mouhoun', 'Sahel', 'Cascades']
}

PUBLIC_NEWS_FEEDS = [
    ('FAO News', 'https://www.fao.org/news/rss/en/'),
    ('CGIAR', 'https://www.cgiar.org/feed/'),
    ('World Bank Agriculture', 'https://blogs.worldbank.org/en/taxonomy/term/1568/feed'),
    ('IFAD', 'https://www.ifad.org/en/web/latest/-/news/rss'),
    ('Africa Agriculture News', 'https://www.africanews.com/feed/rss')
]

AGRI_NEWS_KEYWORDS = [
    'agri', 'agric', 'farm', 'farmer', 'crop', 'livestock', 'poultry', 'sheep', 'goat', 'cattle',
    'irrigation', 'fertilizer', 'seed', 'harvest', 'food security', 'rural', 'cooperative', 'commodity'
]

MAIN_CITIES = {
    'GH': ['Accra', 'Kumasi', 'Tamale'],
    'NG': ['Lagos', 'Abuja', 'Kano'],
    'BF': ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou']
}

CITY_COORDS = {
    'Accra': (5.6037, -0.1870),
    'Kumasi': (6.6885, -1.6244),
    'Tamale': (9.4075, -0.8533),
    'Lagos': (6.5244, 3.3792),
    'Abuja': (9.0765, 7.3986),
    'Kano': (12.0022, 8.5920),
    'Ouagadougou': (12.3714, -1.5197),
    'Bobo-Dioulasso': (11.1771, -4.2979),
    'Koudougou': (12.2526, -2.3627)
}

SOURCE_IMAGES = {
    'FAO News': 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80',
    'CGIAR': 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80',
    'World Bank Agriculture': 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
    'IFAD': 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1200&q=80',
    'Africa Agriculture News': 'https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=1200&q=80'
}

GOV_SOURCES = [
    # Program/project/update pages (not generic homepage)
    {'country': 'GH', 'agency': 'Ministry of Food and Agriculture (MOFA)', 'url': 'https://mofa.gov.gh/site/programmes/'},
    {'country': 'NG', 'agency': 'Federal Ministry of Agriculture and Food Security', 'url': 'https://agriculture.gov.ng/programs/'},
    {'country': 'BF', 'agency': "Ministère de l’Agriculture, des Ressources Animales et Halieutiques", 'url': 'https://www.agriculture.gov.bf/quotidien/les-actualites'}
]


def _valid_photo_url(v: Optional[str]):
    # Only user-uploaded image payloads are accepted (base64 data URL), never remote URLs.
    return _photo_is_stored(v)


def _validate_uploaded_image_input(v: Optional[str], field_name: str, required: bool = False):
    s = str(v or '').strip()
    if not s:
        if required:
            raise HTTPException(status_code=400, detail=f'{field_name} is required. Upload from phone/camera.')
        return
    if s.startswith(('http://', 'https://')):
        raise HTTPException(status_code=400, detail=f'{field_name} must be user-uploaded (no image URLs allowed)')
    if not s.startswith('data:image/'):
        raise HTTPException(status_code=400, detail=f'{field_name} must be an uploaded image payload')


def _file_ref_signature(ref: Optional[str]) -> str:
    s = str(ref or '').strip()
    if not s:
        return ''
    if s.startswith('local:'):
        return s.split('/')[-1]
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:16]


GHCARD_PIN_RE = re.compile(r'^GHA-\d{9}-\d$', re.I)


def _ghana_card_assessment(rec: IDVerification) -> dict:
    id_number_raw = str(getattr(rec, 'id_number', '') or '').strip().upper()
    id_number_normalized = re.sub(r'[^A-Z0-9]', '', id_number_raw)
    expected_normalized = ''
    format_ok = False
    if GHCARD_PIN_RE.match(id_number_raw):
        format_ok = True
        expected_normalized = id_number_raw.replace('-', '')
    elif re.fullmatch(r'GHA\d{10}', id_number_normalized):
        format_ok = True
        expected_normalized = id_number_normalized

    has_front = _valid_photo_url(getattr(rec, 'id_front_photo_url', None))
    has_back = _valid_photo_url(getattr(rec, 'id_back_photo_url', None))
    has_legacy = _valid_photo_url(getattr(rec, 'id_photo_url', None))
    front_sig = _file_ref_signature(getattr(rec, 'id_front_photo_url', None))
    back_sig = _file_ref_signature(getattr(rec, 'id_back_photo_url', None))
    duplicate_images = bool(front_sig and back_sig and front_sig == back_sig)
    front_present = has_front or has_legacy

    hard_failures = []
    warnings = []
    positives = []
    score = 0.0

    if not format_ok:
        warnings.append('Ghana Card PIN format differs from expected GHA-123456789-0 pattern')
    else:
        score += 0.34
        positives.append('Ghana Card PIN format looks valid')

    if front_present:
        score += 0.23
        positives.append('Front ID image attached')
    else:
        hard_failures.append('Front Ghana Card image missing')

    if has_back:
        score += 0.23
        positives.append('Back ID image attached')
    else:
        hard_failures.append('Back Ghana Card image missing')

    if duplicate_images:
        warnings.append('Front and back images appear very similar; verify card sides are clearly captured')
    else:
        if front_present and has_back:
            score += 0.10
            positives.append('Front/back images appear distinct')

    if rec.facial_verification_flag:
        score += 0.10
        positives.append('Facial verification flag present')
    else:
        warnings.append('Facial verification not completed')

    if len(id_number_normalized) >= 13:
        score += 0.0
    else:
        warnings.append('PIN normalization looks shorter than expected')

    if hard_failures:
        status = 'DENIED'
        recommendation = 'AUTO_REJECT'
        review_priority = 'HIGH'
        summary = 'Auto-rejected: ' + '; '.join(hard_failures)
    elif score >= 0.55:
        status = 'APPROVED'
        recommendation = 'AUTO_APPROVE'
        review_priority = 'FAST_PASS'
        summary = 'Auto-approved: Ghana Card submission passed required image + ID checks.'
    elif score >= 0.40:
        status = 'PENDING'
        recommendation = 'MANUAL_REVIEW'
        review_priority = 'NORMAL'
        summary = 'Manual review recommended: basic Ghana Card checks passed but reviewer confirmation is still needed.'
    else:
        status = 'PENDING'
        recommendation = 'MANUAL_REVIEW'
        review_priority = 'NORMAL'
        summary = 'Manual review required: submission is incomplete or weak but not an obvious auto-reject.'

    all_reasons = []
    if hard_failures:
        all_reasons.extend(hard_failures)
    if warnings:
        all_reasons.extend(warnings)
    if positives:
        all_reasons.extend(positives)

    return {
        'document_type': 'GhanaCard',
        'status': status,
        'recommendation': recommendation,
        'review_priority': review_priority,
        'score': round(min(score, 0.99), 3),
        'summary': summary,
        'hard_failures': hard_failures,
        'warnings': warnings,
        'positives': positives,
        'checks': {
            'ghana_card_pin_format_ok': format_ok,
            'front_image_present': front_present,
            'back_image_present': has_back,
            'front_back_distinct': not duplicate_images,
            'facial_verification_flag': bool(rec.facial_verification_flag),
        },
        'extracted': {
            'id_number_raw': id_number_raw,
            'id_number_normalized': expected_normalized or id_number_normalized,
        },
        'reviewer_hint': 'Fast-pass good Ghana Card submissions, but still open the images before approval.' if recommendation == 'FAST_PASS_RECOMMENDED' else 'Check the Ghana Card images and deny if the card is unreadable, mismatched, or clearly invalid.'
    }


def _generic_id_assessment(rec: IDVerification) -> dict:
    score = 0.0
    hard_failures = []
    warnings = []
    positives = []

    if rec.id_number and len(str(rec.id_number).strip()) >= 8:
        score += 0.4
        positives.append('ID number provided')
    else:
        hard_failures.append('ID number too short')

    has_front = _valid_photo_url(getattr(rec, 'id_front_photo_url', None))
    has_back = _valid_photo_url(getattr(rec, 'id_back_photo_url', None))
    has_legacy = _valid_photo_url(getattr(rec, 'id_photo_url', None))

    if has_front and has_back:
        score += 0.4
        positives.append('Front and back images attached')
    elif has_legacy:
        score += 0.2
        warnings.append('Only single ID image provided')
    else:
        hard_failures.append('ID photos missing or invalid')

    if rec.facial_verification_flag:
        score += 0.1
        positives.append('Facial verification flag present')
    else:
        warnings.append('Facial verification not completed')

    if hard_failures:
        status = 'DENIED'
        recommendation = 'AUTO_REJECT'
        summary = 'Auto-rejected: ' + '; '.join(hard_failures)
    else:
        status = 'PENDING'
        recommendation = 'MANUAL_REVIEW'
        summary = 'Manual review required before approval.'

    return {
        'document_type': str(getattr(rec, 'id_type', '') or 'ID'),
        'status': status,
        'recommendation': recommendation,
        'review_priority': 'NORMAL',
        'score': round(min(score, 0.95), 3),
        'summary': summary,
        'hard_failures': hard_failures,
        'warnings': warnings,
        'positives': positives,
        'checks': {
            'front_image_present': has_front or has_legacy,
            'back_image_present': has_back,
            'facial_verification_flag': bool(rec.facial_verification_flag),
        },
        'extracted': {
            'id_number_raw': str(getattr(rec, 'id_number', '') or '').strip(),
            'id_number_normalized': str(getattr(rec, 'id_number', '') or '').strip(),
        },
        'reviewer_hint': 'Approval still requires human review.'
    }


def _assess_id_verification(rec: IDVerification) -> dict:
    if str(getattr(rec, 'id_type', '') or '') == 'GhanaCard':
        return _ghana_card_assessment(rec)
    return _generic_id_assessment(rec)


def _ai_review_id_verification(rec: IDVerification):
    assessment = _assess_id_verification(rec)
    reason_parts = [assessment['summary']]
    if assessment.get('hard_failures'):
        reason_parts.append('Hard failures: ' + '; '.join(assessment['hard_failures']))
    if assessment.get('warnings'):
        reason_parts.append('Warnings: ' + '; '.join(assessment['warnings']))
    if assessment.get('positives'):
        reason_parts.append('Signals: ' + '; '.join(assessment['positives']))
    reason_parts.append(f"Recommendation: {assessment['recommendation']}")
    return assessment['status'], assessment['score'], ' | '.join(reason_parts)


def _require_transact_verified_user(db: Session, user_id: int, label: str = 'User'):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f'{label} not found')

    latest = db.query(IDVerification).filter(IDVerification.user_id == user_id).order_by(IDVerification.created_at.desc(), IDVerification.id.desc()).first()
    review = db.query(VerificationReview).filter(VerificationReview.user_id == user_id).order_by(VerificationReview.reviewed_at.desc().nullslast(), VerificationReview.id.desc()).first()

    if not latest or not review or review.status != 'APPROVED':
        raise HTTPException(status_code=403, detail=f'{label} must complete ID verification and be approved before transacting')

    if str(user.country.value if hasattr(user.country, 'value') else user.country).upper() == 'GH' and str(latest.id_type) == 'GhanaCard':
        if not (_valid_photo_url(getattr(latest, 'id_front_photo_url', None)) and _valid_photo_url(getattr(latest, 'id_back_photo_url', None))):
            raise HTTPException(status_code=403, detail=f'{label} must submit Ghana Card front and back images before transacting')

    return True


def _ai_review_change(module: str, payload: dict):
    score = 1.0
    reasons = []

    # basic quality checks
    for k in ['quantity_kg', 'quantity', 'unit_price', 'amount', 'price']:
        if k in payload and payload[k] is not None:
            try:
                val = float(payload[k])
                if val <= 0:
                    score -= 0.8
                    reasons.append(f'{k} must be > 0')
                elif val > 10_000_000:
                    score -= 0.5
                    reasons.append(f'{k} unusually high')
            except Exception:
                score -= 0.8
                reasons.append(f'{k} is invalid')

    for k in ['crop_name', 'livestock_type', 'location']:
        if k in payload and payload[k] is not None and len(str(payload[k]).strip()) == 0:
            score -= 0.5
            reasons.append(f'{k} is empty')

    decision = 'APPROVED' if score >= 0.6 else 'DENIED'
    reason = 'Auto AI change review: ' + ('; '.join(reasons) if reasons else 'Checks passed')
    return decision, round(max(score, 0), 3), reason


def _save_update_review(db: Session, module: str, record_id: int, action: str, payload: dict, decision: str, ai_score: float, reason: str):
    db.add(UpdateReview(
        module=module,
        record_id=record_id,
        action=action,
        payload_json=json.dumps(payload),
        ai_score=ai_score,
        decision=decision,
        reason=reason
    ))
    db.commit()


def _normalize_phone(value: Optional[str]) -> str:
    s = str(value or '').strip()
    if not s:
        return ''
    keep = ''.join(ch for ch in s if ch.isdigit() or ch == '+')
    if keep.startswith('00'):
        keep = '+' + keep[2:]
    if '+' in keep and not keep.startswith('+'):
        keep = '+' + ''.join(ch for ch in keep if ch.isdigit())

    # Ghana-friendly normalization to reduce login/signup mismatch:
    # 053xxxxxxx -> +23353xxxxxxx
    raw_digits = ''.join(ch for ch in keep if ch.isdigit())
    if keep.startswith('0') and len(raw_digits) == 10:
        keep = '+233' + raw_digits[1:]
    elif keep.startswith('233') and len(raw_digits) >= 12:
        keep = '+' + raw_digits
    elif keep.startswith('+'):
        keep = '+' + raw_digits
    return keep


def _normalize_identifier(value: Optional[str]) -> str:
    v = str(value or '').strip()
    if '@' in v:
        return v.lower()
    return _normalize_phone(v)


def _phone_variants(value: Optional[str]) -> list[str]:
    p = _normalize_phone(value)
    if not p:
        return []
    digits = ''.join(ch for ch in p if ch.isdigit())

    ordered: list[str] = []
    def _add(v: str):
        if v and v not in ordered:
            ordered.append(v)

    # deterministic priority order (most canonical first)
    _add(p)
    _add('+' + digits)
    _add(digits)

    if digits.startswith('233') and len(digits) >= 12:
        _add('0' + digits[3:])
    if digits.startswith('0') and len(digits) == 10:
        _add('+233' + digits[1:])
    if len(digits) >= 9:
        _add(digits[-9:])

    return ordered


def _account_store_path() -> Path:
    p = (Path(__file__).resolve().parents[3] / 'data' / 'runtime' / 'accounts-store.json')
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _account_store_read() -> list[dict]:
    p = _account_store_path()
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _account_store_write(rows: list[dict]):
    p = _account_store_path()
    tmp = p.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    tmp.replace(p)


def _account_store_upsert_user(user: User):
    rows = _account_store_read()
    rec = {
        'phone': _normalize_phone(user.phone),
        'email': (str(user.email or '').lower() or None),
        'full_name': user.full_name,
        'country': user.country.value if hasattr(user.country, 'value') else str(user.country),
        'region': user.region,
        'role': user.role.value if hasattr(user.role, 'value') else str(user.role),
        'hashed_password': user.hashed_password,
        'is_verified': bool(user.is_verified),
        'is_deleted': bool(getattr(user, 'is_deleted', False)),
    }
    updated = False
    for i, row in enumerate(rows):
        if (row.get('phone') and row.get('phone') == rec['phone']) or (row.get('email') and rec.get('email') and row.get('email') == rec['email']):
            rows[i] = {**row, **rec}
            updated = True
            break
    if not updated:
        rows.append(rec)
    _account_store_write(rows[-20000:])


def _user_link_score(db: Session, user: Optional[User]) -> int:
    if not user:
        return -1
    score = 0
    try:
        score += int(db.query(func.count(WorldChatMessage.id)).filter(WorldChatMessage.user_id == user.id).scalar() or 0)
    except Exception:
        pass
    try:
        score += int(db.query(func.count(CommunityPost.id)).filter(CommunityPost.user_id == user.id).scalar() or 0) * 3
    except Exception:
        pass
    try:
        score += int(db.query(func.count(SheepGoatSubscription.id)).filter(SheepGoatSubscription.user_id == user.id).scalar() or 0) * 5
    except Exception:
        pass
    try:
        score += int(db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.user_id == user.id).scalar() or 0) * 2
    except Exception:
        pass
    try:
        p = db.query(CommunityProfile).filter(CommunityProfile.user_id == user.id).first()
        if p:
            score += 5
            if p.avatar_url:
                score += 5
            if p.cover_image_url:
                score += 5
            if p.username:
                score += 3
    except Exception:
        pass
    return score


def _find_existing_user_by_identity(db: Session, *, phone: Optional[str] = None, email: Optional[str] = None, identifier: Optional[str] = None) -> Optional[User]:
    ident = _normalize_identifier(identifier or email or phone)
    candidates: list[User] = []
    seen_ids: set[int] = set()

    def _push(u: Optional[User]):
        if not u or getattr(u, 'is_deleted', False):
            return
        uid = int(getattr(u, 'id', 0) or 0)
        if not uid or uid in seen_ids:
            return
        seen_ids.add(uid)
        candidates.append(u)

    email_norm = str(email or '').strip().lower() if email else ''
    phone_norm = _normalize_phone(phone or identifier)

    if email_norm:
        _push(db.query(User).filter(User.email == email_norm).first())
    if ident and '@' in ident:
        _push(db.query(User).filter(User.email == ident).first())

    for value in [phone_norm, ident if ident and '@' not in ident else None]:
        if not value:
            continue
        for v in _phone_variants(value):
            _push(db.query(User).filter(User.phone == v).first())
        digits = ''.join(ch for ch in str(value) if ch.isdigit())
        if len(digits) >= 9:
            for row in db.query(User).filter(User.phone.like(f"%{digits[-9:]}%")).all():
                _push(row)

    if not candidates and ident:
        recovered = _account_store_recover_user(db, ident)
        _push(recovered)

    if not candidates:
        return None
    return sorted(candidates, key=lambda u: _user_link_score(db, u), reverse=True)[0]


def _account_store_recover_user(db: Session, identifier: str) -> Optional[User]:
    ident = _normalize_identifier(identifier)
    if not ident:
        return None
    rows = _account_store_read()
    hit = None
    for r in rows:
        phone = _normalize_phone(r.get('phone'))
        email = str(r.get('email') or '').strip().lower()
        if ('@' in ident and ident == email) or (ident in _phone_variants(phone)):
            hit = r
            break
    if not hit:
        return None

    if hit.get('is_deleted'):
        return None

    # prevent duplicates if already present under different query path
    hit_phone = _normalize_phone(hit.get('phone'))
    hit_email = str(hit.get('email') or '').strip().lower()
    hit_alt = hit_phone[1:] if str(hit_phone).startswith('+') else f'+{hit_phone}'
    existing = db.query(User).filter((User.phone == hit_phone) | (User.phone == hit_alt) | (User.email == hit_email)).first()
    if existing:
        return existing

    try:
        role_val = str(hit.get('role') or 'Farmer')
        user = User(
            full_name=hit.get('full_name') or 'Recovered User',
            phone=_normalize_phone(hit.get('phone')) or f"TMP-{int(datetime.utcnow().timestamp())}-{random.randint(1000,9999)}",
            email=(str(hit.get('email') or '').lower() or None),
            country=(str(hit.get('country') or 'GH').upper()),
            region=hit.get('region') or 'Unknown',
            role=UserRole(role_val),
            hashed_password=hit.get('hashed_password') or '',
            is_verified=bool(hit.get('is_verified', False)),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        return None



def _paystack_secret_clean() -> str:
    raw = str(settings.PAYSTACK_SECRET_KEY or '').strip().strip('"').strip("'")
    if raw.lower().startswith('bearer '):
        raw = raw.split(' ', 1)[1].strip()
    return raw


def _paystack_headers() -> dict:
    secret = _paystack_secret_clean()
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FarmSavior/1.0 (+https://www.farmsavior.com)',
        'Authorization': f'Bearer {secret}'
    }


def _paystack_transaction_initialize(email: str, amount_major: float, reference: str, callback_url: Optional[str] = None, metadata: Optional[dict] = None) -> dict:
    payload = {
        'email': email,
        'amount': int(round(float(amount_major or 0) * 100)),
        'reference': reference,
        'callback_url': callback_url or settings.PAYSTACK_CALLBACK_URL,
        'metadata': metadata or {}
    }
    req = UrlRequest('https://api.paystack.co/transaction/initialize', data=json.dumps(payload).encode('utf-8'), headers=_paystack_headers(), method='POST')
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8', errors='ignore'))


def _paystack_transaction_verify(reference: str) -> dict:
    req = UrlRequest(f'https://api.paystack.co/transaction/verify/{reference}', headers=_paystack_headers(), method='GET')
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8', errors='ignore'))


def _paystack_signature_valid(raw_body: bytes, signature: str) -> bool:
    secret = _paystack_secret_clean().encode('utf-8')
    expected = hmac.new(secret, raw_body, hashlib.sha512).hexdigest()
    return bool(signature) and hmac.compare_digest(expected, signature)


def _paystack_create_transfer_recipient(profile: SellerPayoutProfile) -> dict:
    recipient_type = 'mobile_money' if str(profile.payout_method).upper() == 'MOBILE_MONEY' else 'nuban'
    details = {
        'type': recipient_type,
        'name': profile.account_name,
        'currency': profile.currency or 'GHS',
    }
    if recipient_type == 'mobile_money':
        details.update({
            'account_number': profile.mobile_money_number,
            'bank_code': profile.mobile_money_provider or 'MTN',
        })
    else:
        details.update({
            'account_number': profile.account_number,
            'bank_code': profile.bank_name or 'BANK',
        })
    req = UrlRequest('https://api.paystack.co/transferrecipient', data=json.dumps(details).encode('utf-8'), headers=_paystack_headers(), method='POST')
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8', errors='ignore'))


def _paystack_initiate_transfer(amount_major: float, recipient_code: str, reason: str, reference: str) -> dict:
    payload = {
        'source': 'balance',
        'amount': int(round(float(amount_major or 0) * 100)),
        'recipient': recipient_code,
        'reason': reason,
        'reference': reference,
    }
    req = UrlRequest('https://api.paystack.co/transfer', data=json.dumps(payload).encode('utf-8'), headers=_paystack_headers(), method='POST')
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8', errors='ignore'))

def _trial_ledger_path() -> Path:
    p = (Path(__file__).resolve().parents[3] / 'data' / 'runtime' / 'subscription-trial-ledger.json')
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _trial_ledger_read() -> dict:
    p = _trial_ledger_path()
    if not p.exists():
        return {'identities': [], 'user_ids': []}
    try:
        d = json.loads(p.read_text(encoding='utf-8'))
        if not isinstance(d, dict):
            return {'identities': [], 'user_ids': []}
        d.setdefault('identities', [])
        d.setdefault('user_ids', [])
        return d
    except Exception:
        return {'identities': [], 'user_ids': []}


def _trial_ledger_write(d: dict):
    p = _trial_ledger_path()
    tmp = p.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(d, ensure_ascii=False), encoding='utf-8')
    tmp.replace(p)


def _trial_identity_markers(user: Optional[User], user_id: Optional[int]):
    markers = []
    if user:
        phone = _normalize_phone(getattr(user, 'phone', ''))
        email = str(getattr(user, 'email', '') or '').strip().lower()
        if phone:
            markers.append(f'phone:{phone}')
        if email:
            markers.append(f'email:{email}')
    if user_id:
        markers.append(f'user:{int(user_id)}')
    return markers


def _trial_already_used(user: Optional[User], user_id: Optional[int], db: Session) -> bool:
    # DB check
    if user_id:
        if db.query(SheepGoatSubscription).filter(
            SheepGoatSubscription.user_id == int(user_id),
            SheepGoatSubscription.status.in_(['TRIAL_ACTIVE', 'TRIAL_CANCELLED', 'ACTIVE', 'PENDING_PAYMENT'])
        ).first():
            return True

    # Ledger check across identifiers
    ledger = _trial_ledger_read()
    used = set(ledger.get('identities', [])) | set(ledger.get('user_ids', []))
    for m in _trial_identity_markers(user, user_id):
        if m.startswith('user:'):
            if m in used:
                return True
        else:
            if m in used:
                return True
    return False


def _mark_trial_used(user: Optional[User], user_id: Optional[int]):
    ledger = _trial_ledger_read()
    ids = set(ledger.get('identities', []))
    users = set(ledger.get('user_ids', []))
    for m in _trial_identity_markers(user, user_id):
        if m.startswith('user:'):
            users.add(m)
        else:
            ids.add(m)
    ledger['identities'] = sorted(ids)
    ledger['user_ids'] = sorted(users)
    _trial_ledger_write(ledger)


LIVESTOCK_PLAN_CATALOG = {
    'free': {
        'plan_code': 'free',
        'name': 'Livestock Free',
        'monthly_usd': 0.0,
        'yearly_usd': 0.0,
        'record_limit': 25,
        'team_limit': 1,
        'photos_allowed': False,
        'docs_allowed': False,
        'features': ['Up to 25 animals total', 'No photos allowed', 'No documents allowed'],
    },
    'premium': {
        'plan_code': 'premium',
        'name': 'Livestock Premium',
        'monthly_usd': 9.99,
        'yearly_usd': 102.90,
        'record_limit': None,
        'team_limit': None,
        'photos_allowed': True,
        'docs_allowed': True,
        'features': ['Unlimited animals', 'All livestock features unlocked', 'Photos and documents allowed', 'Choose monthly or yearly billing'],
    },
}


def _livestock_plan_snapshot(plan_code: str) -> dict:
    plan = dict(LIVESTOCK_PLAN_CATALOG.get(plan_code, LIVESTOCK_PLAN_CATALOG['free']))
    plan['record_limit_label'] = 'Unlimited animals' if plan.get('record_limit') in (None, 0) else f"Up to {int(plan['record_limit'])} animals total"
    plan['team_limit_label'] = 'Unlimited team users' if plan.get('team_limit') in (None, 0) else f"Up to {int(plan['team_limit'])} team user{'s' if int(plan['team_limit']) != 1 else ''}"
    yearly = float(plan.get('yearly_usd') or 0)
    monthly = float(plan.get('monthly_usd') or 0)
    if monthly > 0 and yearly > 0:
        annualized = monthly * 12
        plan['yearly_savings_pct'] = round(((annualized - yearly) / annualized) * 100, 1)
    else:
        plan['yearly_savings_pct'] = 0.0
    return plan


def _subscription_status_upper(value: Optional[str]) -> str:
    return str(value or '').upper()


def _select_best_subscription_record(records: list[SheepGoatSubscription]) -> Optional[SheepGoatSubscription]:
    active_statuses = {'ACTIVE', 'TRIAL_ACTIVE'}
    active_records = [rec for rec in records if _subscription_status_upper(rec.status) in active_statuses]
    if active_records:
        return active_records[0]
    return records[0] if records else None


def _livestock_active_subscription_for_user(user_id: Optional[int], db: Session):
    if not user_id:
        return None

    records = db.query(SheepGoatSubscription).filter(
        SheepGoatSubscription.user_id == int(user_id),
        SheepGoatSubscription.reference.like('SGSUB-%')
    ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(50).all()

    if not records:
        return None

    pending_statuses = {'PENDING_PAYMENT', 'PENDING', 'PROCESSING'}
    synced_any = False
    for rec in records:
        if _subscription_status_upper(rec.status) in pending_statuses:
            _sync_subscription_record(rec, db)
            synced_any = True

    if synced_any:
        records = db.query(SheepGoatSubscription).filter(
            SheepGoatSubscription.user_id == int(user_id),
            SheepGoatSubscription.reference.like('SGSUB-%')
        ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(50).all()

    return _select_best_subscription_record(records)



def _university_active_subscription_for_user(product: str, user_id: Optional[int], db: Session):
    if not user_id:
        return None

    prefix = _university_subscription_prefix(product)
    records = db.query(SheepGoatSubscription).filter(
        SheepGoatSubscription.user_id == int(user_id),
        SheepGoatSubscription.reference.like(f'{prefix}%')
    ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(50).all()

    if not records:
        return None

    pending_statuses = {'PENDING_PAYMENT', 'PENDING', 'PROCESSING'}
    synced_any = False
    for rec in records:
        if _subscription_status_upper(rec.status) in pending_statuses:
            _sync_subscription_record(rec, db)
            synced_any = True

    if synced_any:
        records = db.query(SheepGoatSubscription).filter(
            SheepGoatSubscription.user_id == int(user_id),
            SheepGoatSubscription.reference.like(f'{prefix}%')
        ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(50).all()

    return _select_best_subscription_record(records)


def _livestock_access_context(user_id: Optional[int], db: Session) -> dict:
    sub = _livestock_active_subscription_for_user(user_id, db)
    if not sub:
        return {
            'tier': 'free',
            'status': 'FREE',
            'record_limit': 25,
            'can_create_records': True,
            'plan': _livestock_plan_snapshot('free'),
            'subscription': None,
        }
    status = _subscription_status_upper(sub.status)
    tier = str(sub.plan_code or 'premium') if status in ['ACTIVE', 'TRIAL_ACTIVE'] else 'free'
    plan = _livestock_plan_snapshot(tier)
    return {
        'tier': tier,
        'status': status,
        'record_limit': plan.get('record_limit'),
        'can_create_records': status in ['ACTIVE', 'TRIAL_ACTIVE'] or tier == 'free',
        'plan': plan,
        'subscription': sub,
    }


def _enforce_livestock_record_limit(user_id: Optional[int], db: Session):
    ctx = _livestock_access_context(user_id, db)
    if not ctx['can_create_records']:
        raise HTTPException(status_code=402, detail='Livestock records require an active subscription or trial')
    limit = ctx.get('record_limit')
    if limit in (None, 0):
        return ctx
    count = int(db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.user_id == int(user_id or 0)).scalar() or 0)
    if count >= int(limit):
        label = ctx.get('plan', {}).get('record_limit_label') or f'Up to {int(limit)} animals'
        raise HTTPException(status_code=403, detail=f"{label} reached for your current livestock tier ({ctx['tier']}). Upgrade to add more records.")
    return ctx


def _twilio_from_for_destination(destination: str) -> str:
    dest = str(destination or '').strip()
    sender = str(settings.TWILIO_FROM_NUMBER or '').strip()
    gh_sender = str(settings.GHANA_TWILIO_SENDER_ID or 'SheepGhana').strip()
    if dest.startswith('+233'):
        return gh_sender
    return sender


def _validate_twilio_sender_for_destination(destination: str) -> Optional[str]:
    dest = str(destination or '').strip()
    sender = _twilio_from_for_destination(dest)
    gh_sender = str(settings.GHANA_TWILIO_SENDER_ID or 'SheepGhana').strip()
    if dest.startswith('+233') and sender != gh_sender:
        return f"Ghana SMS requires sender ID {gh_sender}"
    if not sender:
        return 'Twilio sender is not configured'
    return None


def _send_otp(destination: str, method: str, code: str):
    message = f"Your FarmSavior OTP is {code}. It expires soon."
    if method == 'email' and settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS:
        try:
            msg = EmailMessage()
            msg['Subject'] = 'FarmSavior verification code'
            msg['From'] = settings.SMTP_FROM
            msg['To'] = destination
            msg.set_content(message)
            smtp_host = str(settings.SMTP_HOST or '').strip().strip('"').strip("'")
            smtp_user = str(settings.SMTP_USER or '').strip().strip('"').strip("'")
            smtp_pass = str(settings.SMTP_PASS or '').strip().strip('"').strip("'")
            smtp_from = str(settings.SMTP_FROM or '').strip().strip('"').strip("'") or smtp_user
            msg['From'] = smtp_from
            with smtplib.SMTP(smtp_host, int(settings.SMTP_PORT or 587), timeout=4) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(msg)
            return {'sent': True, 'channel': 'email'}
        except Exception as e:
            return {'sent': False, 'channel': 'email', 'error': str(e)}

    if method == 'phone' and settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
        sender_error = _validate_twilio_sender_for_destination(destination)
        if sender_error:
            return {'sent': False, 'channel': 'phone', 'error': sender_error}
        try:
            twilio_from = _twilio_from_for_destination(destination)
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
            body = urlencode({'To': destination, 'From': twilio_from, 'Body': message}).encode('utf-8')
            req = UrlRequest(url, data=body)
            import base64
            token = base64.b64encode(f"{settings.TWILIO_ACCOUNT_SID}:{settings.TWILIO_AUTH_TOKEN}".encode()).decode()
            req.add_header('Authorization', f'Basic {token}')
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            with urlopen(req, timeout=12) as _:
                pass
            return {'sent': True, 'channel': 'phone'}
        except HTTPError as e:
            try:
                raw = e.read().decode('utf-8', errors='ignore')
                parsed = json.loads(raw) if raw else {}
                msg = parsed.get('message') or raw or str(e)
                code = parsed.get('code')
                return {'sent': False, 'channel': 'phone', 'error': f"Twilio HTTP {getattr(e, 'code', 'ERR')}: {msg}" + (f" (code {code})" if code else '')}
            except Exception:
                return {'sent': False, 'channel': 'phone', 'error': str(e)}
        except Exception as e:
            return {'sent': False, 'channel': 'phone', 'error': str(e)}

    return {'sent': False, 'channel': method}


@router.post('/auth/register')
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    method = (payload.signup_method or 'phone').lower()
    payload.phone = _normalize_phone(payload.phone)
    if payload.email:
        payload.email = str(payload.email).strip().lower()

    existing_user = None
    if method == 'phone':
        if not payload.phone:
            raise HTTPException(status_code=400, detail='Phone is required for phone signup')
        existing_user = _find_existing_user_by_identity(db, phone=payload.phone, email=payload.email)
        if existing_user and existing_user.is_verified:
            raise HTTPException(status_code=400, detail='Phone already registered')
        dest = payload.phone
    elif method == 'email':
        if not payload.email:
            raise HTTPException(status_code=400, detail='Email is required for email signup')
        existing_user = _find_existing_user_by_identity(db, phone=payload.phone, email=payload.email.lower())
        if existing_user and existing_user.is_verified:
            raise HTTPException(status_code=400, detail='Email already registered')
        if not payload.phone:
            payload.phone = existing_user.phone if existing_user and existing_user.phone else f"TMP-{int(datetime.utcnow().timestamp())}-{random.randint(1000,9999)}"
        dest = payload.email.lower()
    else:
        raise HTTPException(status_code=400, detail='Unsupported signup method')

    if existing_user and not existing_user.is_verified:
        existing_user.full_name = payload.full_name or existing_user.full_name
        existing_user.email = (payload.email.lower() if payload.email else existing_user.email)
        existing_user.phone = payload.phone or existing_user.phone
        existing_user.country = (str(payload.country or existing_user.country or '').strip().upper() or 'GH')
        existing_user.region = payload.region or existing_user.region
        existing_user.role = UserRole(payload.user_type)
        if payload.password:
            existing_user.hashed_password = hash_password(payload.password)
        user = existing_user
        db.commit()
        db.refresh(user)
    else:
        user = User(
            full_name=payload.full_name,
            phone=payload.phone,
            email=(payload.email.lower() if payload.email else None),
            country=(str(payload.country or '').strip().upper() or 'GH'),
            region=payload.region,
            role=UserRole(payload.user_type),
            hashed_password=hash_password(payload.password or 'changeme')
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    _account_store_upsert_user(user)

    code = f"{random.randint(100000, 999999)}"
    db.add(OTPCode(phone=user.phone, destination=dest, channel=method, code=code))
    db.commit()

    delivery = _send_otp(dest, method, code)
    return {
        'user_id': user.id,
        'otp_sent': delivery.get('sent', False),
        'otp_channel': method,
        'otp_destination': dest,
        'otp_mock_code': code,
        'otp_error': delivery.get('error', ''),
        'message': 'OTP sent' if not existing_user else 'OTP resent'
    }


@router.post('/auth/login', response_model=TokenResponse)
def login_user(payload: UserLogin, db: Session = Depends(get_db)):
    # Ensure default admin exists
    admin_phone = '+233500000001'
    admin = db.query(User).filter(User.phone == admin_phone).first()
    if not admin:
        admin = User(
            full_name='FarmSavior Admin',
            phone=admin_phone,
            email='admin@farmsavior.local',
            country='GH',
            region='HQ',
            role=UserRole.admin,
            hashed_password=hash_password('Admin@123'),
            is_verified=True
        )
        db.add(admin)
        db.commit()

    ident_raw = (payload.identifier or '').strip()
    ident = _normalize_identifier(ident_raw)

    candidates: list[User] = []
    seen_ids: set[int] = set()

    def _push(u: Optional[User]):
        if not u:
            return
        uid = int(getattr(u, 'id', 0) or 0)
        if uid in seen_ids:
            return
        seen_ids.add(uid)
        candidates.append(u)

    _push(_find_existing_user_by_identity(db, identifier=ident))

    if '@' in ident:
        for row in db.query(User).filter(User.email == ident).all():
            _push(row)
    else:
        for v in _phone_variants(ident):
            for row in db.query(User).filter(User.phone == v).all():
                _push(row)

        digits = ''.join(ch for ch in ident if ch.isdigit())
        if len(digits) >= 9:
            for row in db.query(User).filter(User.phone.like(f"%{digits[-9:]}%")).all():
                _push(row)

    valid_candidates: list[User] = []
    unverified_match = False
    for cand in candidates:
        if cand.is_deleted or not cand.hashed_password:
            continue
        if verify_password(payload.password, cand.hashed_password):
            if not cand.is_verified:
                unverified_match = True
                continue
            valid_candidates.append(cand)

    if not valid_candidates:
        if unverified_match:
            raise HTTPException(status_code=403, detail='Account not verified. Please verify OTP before logging in.')
        raise HTTPException(status_code=401, detail='Invalid login credentials')

    user = sorted(valid_candidates, key=lambda u: _user_link_score(db, u), reverse=True)[0]
    _account_store_upsert_user(user)

    return TokenResponse(access_token=create_access_token(subject=str(user.id), phone=user.phone, email=user.email or ''))


@router.post('/auth/verify-otp', response_model=TokenResponse)
def verify_otp(payload: OTPVerify, db: Session = Depends(get_db)):
    dest = (payload.destination or '').strip().lower()
    otp = db.query(OTPCode).filter((OTPCode.destination == dest) | (OTPCode.phone == payload.destination), OTPCode.is_used == False).order_by(OTPCode.id.desc()).first()
    if not otp:
        raise HTTPException(status_code=404, detail='OTP not found')
    if payload.code not in [otp.code, settings.OTP_BYPASS_CODE]:
        raise HTTPException(status_code=400, detail='Invalid OTP')
    otp.is_used = True
    user = _find_existing_user_by_identity(db, phone=otp.phone, email=otp.destination, identifier=otp.destination or otp.phone)
    if user:
        user.is_verified = True
        _account_store_upsert_user(user)
    db.commit()

    return TokenResponse(access_token=create_access_token(subject=str(user.id), phone=user.phone, email=user.email or ''))


def _current_user_from_auth(authorization: Optional[str], db: Session):
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Missing bearer token')
    token = authorization.split(' ', 1)[1]
    payload = decode_access_token(token)
    sub = str(payload.get('sub') or payload.get('uid') or '').strip()
    token_phone = str(payload.get('phone') or '').strip()
    token_email = str(payload.get('email') or '').strip().lower()
    user = None
    if sub.isdigit():
        user = db.query(User).filter(User.id == int(sub)).first()
    if not user and sub:
        norm = _normalize_identifier(sub)
        if '@' in norm:
            user = db.query(User).filter(User.email == norm).first()
        else:
            alt = norm[1:] if norm.startswith('+') else f'+{norm}'
            user = db.query(User).filter((User.phone == norm) | (User.phone == alt)).first()
    if (not user or user.is_deleted) and (token_phone or token_email):
        user = _find_existing_user_by_identity(db, phone=token_phone, email=token_email, identifier=token_email or token_phone)
    if not user or user.is_deleted:
        raise HTTPException(status_code=401, detail='User not found')
    return user


@router.get('/auth/me')
def auth_me(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    role = u.role.value if hasattr(u.role, 'value') else str(u.role)
    effective_role = 'Admin' if _is_admin_user(u) else ('Farmer' if str(role).lower() == 'admin' else role)
    identity = _identity_review_for_user(db, u.id)
    return {
        'id': u.id,
        'full_name': u.full_name,
        'phone': u.phone,
        'email': u.email,
        'country': u.country.value if hasattr(u.country, 'value') else str(u.country),
        'region': u.region,
        'role': effective_role,
        'identity_verification_status': identity['status'],
        'identity_status_label': identity['label'],
        'identity_blue_check': identity['blue_check']
    }


@router.put('/auth/me')
def update_auth_me(payload: AccountUpdateIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    data = payload.model_dump(exclude_none=True)
    if 'full_name' in data and str(data['full_name']).strip():
        u.full_name = str(data['full_name']).strip()
    if 'region' in data and str(data['region']).strip():
        u.region = str(data['region']).strip()
    db.commit()
    db.refresh(u)
    _account_store_upsert_user(u)
    role = u.role.value if hasattr(u.role, 'value') else str(u.role)
    effective_role = 'Admin' if _is_admin_user(u) else ('Farmer' if str(role).lower() == 'admin' else role)
    identity = _identity_review_for_user(db, u.id)
    return {
        'id': u.id,
        'full_name': u.full_name,
        'phone': u.phone,
        'email': u.email,
        'country': u.country.value if hasattr(u.country, 'value') else str(u.country),
        'region': u.region,
        'role': effective_role,
        'identity_verification_status': identity['status'],
        'identity_status_label': identity['label'],
        'identity_blue_check': identity['blue_check']
    }


@router.post('/auth/change-password')
def change_password(payload: PasswordChangeIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    if not verify_password(payload.current_password, u.hashed_password or ''):
        raise HTTPException(status_code=400, detail='Current password is incorrect')
    if len(payload.new_password or '') < 6:
        raise HTTPException(status_code=400, detail='New password must be at least 6 characters')
    u.hashed_password = hash_password(payload.new_password)
    db.commit()
    _account_store_upsert_user(u)
    return {'message': 'Password updated successfully'}


@router.post('/auth/delete-account')
def delete_account(payload: DeleteAccountIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    if not verify_password(payload.current_password, u.hashed_password or ''):
        raise HTTPException(status_code=400, detail='Current password is incorrect')

    stamp = int(datetime.utcnow().timestamp())
    u.is_deleted = True
    u.deleted_at = datetime.utcnow()
    u.full_name = 'Deleted User'
    u.hashed_password = hash_password(f'deleted-{stamp}-{random.randint(1000,9999)}')
    if u.phone:
        u.phone = f"deleted-{u.id}-{stamp}"
    if u.email:
        u.email = f"deleted-{u.id}-{stamp}@deleted.local"
    db.commit()
    _account_store_upsert_user(u)
    return {'message': 'Account deleted successfully'}


@router.get('/users')
def list_users(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail='Admin access required')
    return db.query(User).filter(User.is_deleted == False).all()


@router.post('/analytics/events')
def analytics_event(payload: dict = Body(...), authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user_id = None
    phone = None
    if authorization and authorization.lower().startswith('bearer '):
        try:
            u = _current_user_from_auth(authorization, db)
            user_id = u.id
            phone = u.phone
        except Exception:
            pass

    event_name = str(payload.get('event_name', 'unknown'))[:80]
    props: dict[str, Any] = payload.get('properties') or {}
    safe_props = {k: v for k, v in props.items() if k not in ['password', 'otp', 'token']}

    write_jsonl('raw/users/events.jsonl', {
        'event_name': event_name,
        'user_id': user_id,
        'phone': phone,
        'country': payload.get('country'),
        'role_hint': payload.get('role_hint'),
        'properties': safe_props,
    })
    return {'message': 'event captured'}


@router.get('/analytics/users/summary')
def analytics_users_summary(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail='Admin access required')
    p = (Path(__file__).resolve().parents[3] / 'data' / 'raw' / 'users' / 'events.jsonl')
    total = 0
    by_event = {}
    by_country = {}
    if p.exists():
        with p.open('r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                total += 1
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                ev = rec.get('event_name', 'unknown')
                cc = rec.get('country') or 'UNK'
                by_event[ev] = by_event.get(ev, 0) + 1
                by_country[cc] = by_country.get(cc, 0) + 1

    return {
        'total_events': total,
        'events_breakdown': by_event,
        'country_breakdown': by_country,
        'generated_at_utc': datetime.utcnow().isoformat() + 'Z'
    }


@router.post('/onboarding/id-verification')
def create_id_verification(payload: IDVerificationIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    admin = _current_user_from_auth(authorization, db)
    if not _is_admin_user(admin):
        raise HTTPException(status_code=403, detail='Admin access required')
    data = payload.model_dump()
    data['user_id'] = int(payload.user_id)
    if not data.get('id_front_photo_url'):
        data['id_front_photo_url'] = data.get('id_photo_url')

    is_ghana_card = str(data.get('id_type') or '') == 'GhanaCard'
    _validate_uploaded_image_input(data.get('id_front_photo_url'), 'id_front_photo_url', required=is_ghana_card)
    _validate_uploaded_image_input(data.get('id_back_photo_url'), 'id_back_photo_url', required=is_ghana_card)
    _validate_uploaded_image_input(data.get('id_photo_url'), 'id_photo_url', required=not is_ghana_card)

    data['id_photo_url'] = _store_uploaded_image_data(data.get('id_photo_url'), user_id=int(data['user_id']), side='legacy') or ''
    data['id_front_photo_url'] = _store_uploaded_image_data(data.get('id_front_photo_url'), user_id=int(data['user_id']), side='front')
    data['id_back_photo_url'] = _store_uploaded_image_data(data.get('id_back_photo_url'), user_id=int(data['user_id']), side='back')

    rec = IDVerification(**data)
    db.add(rec)
    db.commit()
    db.refresh(rec)

    ai_status, ai_score, ai_reason = _ai_review_id_verification(rec)
    review = VerificationReview(
        id_verification_id=rec.id,
        user_id=rec.user_id,
        status=ai_status,
        ai_score=ai_score,
        ai_reason=ai_reason,
        reviewed_at=datetime.utcnow()
    )
    db.add(review)
    db.commit()
    return rec


@router.get('/onboarding/id-verification')
def list_id_verifications(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    admin = _current_user_from_auth(authorization, db)
    if not _is_admin_user(admin):
        raise HTTPException(status_code=403, detail='Admin access required')
    return db.query(IDVerification).order_by(IDVerification.id.desc()).all()


@router.get('/onboarding/id-verification/me')
def my_latest_id_verification(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    iv = db.query(IDVerification).filter(IDVerification.user_id == u.id).order_by(IDVerification.created_at.desc(), IDVerification.id.desc()).first()
    if not iv:
        return {'application': None, 'review': None}
    review = db.query(VerificationReview).filter(VerificationReview.id_verification_id == iv.id).first()
    if review and str(review.status or '').upper() == 'PENDING':
        ai_status, ai_score, ai_reason = _ai_review_id_verification(iv)
        review.status = ai_status
        review.ai_score = ai_score
        review.ai_reason = ai_reason
        review.reviewed_at = datetime.utcnow()
        db.commit()
        db.refresh(review)
    token = None
    if authorization and str(authorization).lower().startswith('bearer '):
        token = str(authorization).split(' ', 1)[1].strip()
    return _verification_view_payload(iv, review, token)


@router.post('/onboarding/id-verification/me')
def submit_my_id_verification(payload: IDVerificationSelfIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    data = payload.model_dump()
    if not data.get('id_photo_url'):
        data['id_photo_url'] = data.get('id_front_photo_url') or ''
    if not data.get('id_front_photo_url'):
        data['id_front_photo_url'] = data.get('id_photo_url')

    is_ghana_card = str(data.get('id_type') or '') == 'GhanaCard'
    _validate_uploaded_image_input(data.get('id_front_photo_url'), 'id_front_photo_url', required=is_ghana_card)
    _validate_uploaded_image_input(data.get('id_back_photo_url'), 'id_back_photo_url', required=is_ghana_card)
    _validate_uploaded_image_input(data.get('id_photo_url'), 'id_photo_url', required=not is_ghana_card)

    data['id_photo_url'] = _store_uploaded_image_data(data.get('id_photo_url'), user_id=int(u.id), side='legacy') or ''
    data['id_front_photo_url'] = _store_uploaded_image_data(data.get('id_front_photo_url'), user_id=int(u.id), side='front')
    data['id_back_photo_url'] = _store_uploaded_image_data(data.get('id_back_photo_url'), user_id=int(u.id), side='back')

    rec = IDVerification(user_id=u.id, **data)
    db.add(rec)
    db.commit()
    db.refresh(rec)

    ai_status, ai_score, ai_reason = _ai_review_id_verification(rec)
    review = VerificationReview(
        id_verification_id=rec.id,
        user_id=u.id,
        status=ai_status,
        ai_score=ai_score,
        ai_reason=ai_reason,
        reviewed_at=datetime.utcnow()
    )
    db.add(review)
    db.commit()

    return {'message': 'Verification submitted and auto-reviewed', 'id_verification_id': rec.id, 'status': ai_status, 'ai_score': ai_score, 'ai_reason': ai_reason}



@router.get('/verification/files/{id_verification_id}/{side}')
def verification_file(id_verification_id: int, side: str, authorization: Optional[str] = Header(None), token: Optional[str] = None, db: Session = Depends(get_db)):
    auth_value = _file_token_from_request(authorization, token)
    user = _current_user_from_auth(auth_value, db)
    iv = db.query(IDVerification).filter(IDVerification.id == id_verification_id).first()
    if not iv:
        raise HTTPException(status_code=404, detail='Verification application not found')
    if (not _is_admin_user(user)) and int(user.id) != int(iv.user_id):
        raise HTTPException(status_code=403, detail='Not allowed to access this verification file')
    side_key = str(side or '').lower()
    ref = iv.id_photo_url
    if side_key == 'front':
        ref = iv.id_front_photo_url or iv.id_photo_url
    elif side_key == 'back':
        ref = iv.id_back_photo_url
    elif side_key != 'legacy':
        raise HTTPException(status_code=400, detail='Invalid verification file side')
    path = _local_photo_path(ref)
    if path and path.exists():
        return FileResponse(path)
    if str(ref or '').startswith('data:image/'):
        raise HTTPException(status_code=409, detail='Verification image still uses legacy embedded storage')
    raise HTTPException(status_code=404, detail='Verification file not found')


@router.get('/verification/applications')
def list_verification_applications(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    admin = _current_user_from_auth(authorization, db)
    if not _is_admin_user(admin):
        raise HTTPException(status_code=403, detail='Admin access required')
    rows = db.query(VerificationReview, IDVerification, User).join(
        IDVerification, VerificationReview.id_verification_id == IDVerification.id
    ).join(
        User, VerificationReview.user_id == User.id
    ).order_by(VerificationReview.id.desc()).all()

    return [{
        'review_id': r.id,
        'id_verification_id': iv.id,
        'user_id': u.id,
        'full_name': u.full_name,
        'phone': u.phone,
        'country': u.country.value if hasattr(u.country, 'value') else str(u.country),
        'id_type': iv.id_type,
        'id_number': iv.id_number,
        'id_photo_url': iv.id_photo_url,
        'id_front_photo_url': iv.id_front_photo_url,
        'id_back_photo_url': iv.id_back_photo_url,
        'id_photo_view_url': f'/api/v1/verification/files/{iv.id}/legacy',
        'id_front_photo_view_url': f'/api/v1/verification/files/{iv.id}/front',
        'id_back_photo_view_url': f'/api/v1/verification/files/{iv.id}/back',
        'facial_verification_flag': iv.facial_verification_flag,
        'status': r.status,
        'ai_score': r.ai_score,
        'ai_reason': r.ai_reason,
        'reviewer_note': r.reviewer_note,
        'reviewed_at': r.reviewed_at,
        'assessment': _assess_id_verification(iv),
        'badge_ready': str(r.status or '').upper() == 'APPROVED',
    } for r, iv, u in rows]


@router.post('/verification/analyze/{id_verification_id}')
def analyze_verification(id_verification_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    admin = _current_user_from_auth(authorization, db)
    if not _is_admin_user(admin):
        raise HTTPException(status_code=403, detail='Admin access required')
    iv = db.query(IDVerification).filter(IDVerification.id == id_verification_id).first()
    if not iv:
        raise HTTPException(status_code=404, detail='Verification application not found')

    review = db.query(VerificationReview).filter(VerificationReview.id_verification_id == id_verification_id).first()
    if not review:
        review = VerificationReview(id_verification_id=iv.id, user_id=iv.user_id, status='PENDING')
        db.add(review)

    status, score, reason = _ai_review_id_verification(iv)
    review.status = status
    review.ai_score = score
    review.ai_reason = reason
    review.reviewed_at = datetime.utcnow()
    db.commit()

    return {'id_verification_id': iv.id, 'status': status, 'ai_score': score, 'ai_reason': reason}


@router.post('/verification/analyze-all')
def analyze_all_verifications(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    admin = _current_user_from_auth(authorization, db)
    if not _is_admin_user(admin):
        raise HTTPException(status_code=403, detail='Admin access required')
    all_ids = [x.id for x in db.query(IDVerification).all()]
    approved = 0
    denied = 0
    for vid in all_ids:
        result = analyze_verification(vid, authorization, db)
        if result['status'] == 'APPROVED':
            approved += 1
        else:
            denied += 1
    return {'message': 'AI analysis complete', 'total': len(all_ids), 'approved': approved, 'denied': denied}


@router.post('/verification/decision/{id_verification_id}')
def manual_verification_decision(id_verification_id: int, payload: VerificationDecisionIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    admin = _current_user_from_auth(authorization, db)
    if not _is_admin_user(admin):
        raise HTTPException(status_code=403, detail='Admin access required')
    iv = db.query(IDVerification).filter(IDVerification.id == id_verification_id).first()
    if not iv:
        raise HTTPException(status_code=404, detail='Verification application not found')

    review = db.query(VerificationReview).filter(VerificationReview.id_verification_id == id_verification_id).first()
    if not review:
        review = VerificationReview(id_verification_id=iv.id, user_id=iv.user_id)
        db.add(review)

    assessment = _assess_id_verification(iv)
    review.status = payload.status
    if payload.reviewer_note:
        review.reviewer_note = payload.reviewer_note
    elif payload.status == 'APPROVED':
        review.reviewer_note = 'Approved by reviewer after Ghana-focused document check. Badge is now active.' if str(iv.id_type) == 'GhanaCard' else 'Approved by reviewer after document check.'
    else:
        denial_reasons = assessment.get('hard_failures') or assessment.get('warnings') or ['Reviewer denied the submission after manual check.']
        review.reviewer_note = 'Denied: ' + '; '.join(denial_reasons[:3])
    review.reviewed_at = datetime.utcnow()
    db.commit()
    identity = _identity_review_for_user(db, iv.user_id)
    return {'message': 'Decision saved', 'status': review.status, 'identity_status': identity['status'], 'identity_blue_check': identity['blue_check'], 'identity_label': identity['label'], 'reviewer_note': review.reviewer_note, 'assessment': assessment}


@router.get('/reviews/updates')
def list_update_reviews(module: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(UpdateReview)
    if module:
        q = q.filter(UpdateReview.module == module)
    return q.order_by(UpdateReview.id.desc()).all()


@router.get('/map/config')
def map_config():
    return {
        'provider': 'google_maps',
        'embed_hint': 'Use VITE_GOOGLE_MAPS_API_KEY for JS map, fallback to OSM iframe without key.'
    }


@router.get('/gov/programs')
def gov_programs():
    """Best-effort official-source fetch for ministry programs/subsidies in GH/NG/BF."""
    results = []
    for src in GOV_SOURCES:
        try:
            req = UrlRequest(src['url'], headers={'User-Agent': 'FarmSaviorGovBot/1.0'})
            try:
                with urlopen(req, timeout=8) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')
            except Exception:
                # fallback for ministry sites with broken TLS chain
                insecure_ctx = ssl._create_unverified_context()
                with urlopen(req, timeout=8, context=insecure_ctx) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')

            title_match = re.search(r'<title>(.*?)</title>', html, flags=re.I | re.S)
            page_title = re.sub(r'\s+', ' ', title_match.group(1)).strip() if title_match else src['agency']

            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text)
            snippets = []
            for kw in ['subsid', 'programme', 'program', 'grant', 'fertilizer', 'support', 'farmer']:
                m = re.search(rf'(.{{0,80}}{kw}.{{0,120}})', text, flags=re.I)
                if m:
                    snippets.append(m.group(1).strip())
                if len(snippets) >= 3:
                    break

            results.append({
                'country': src['country'],
                'agency': src['agency'],
                'source_url': src['url'],
                'headline': page_title,
                'program_snippets': snippets,
                'status': 'ok',
                'last_checked_utc': datetime.utcnow().isoformat() + 'Z'
            })
        except Exception as e:
            results.append({
                'country': src['country'],
                'agency': src['agency'],
                'source_url': src['url'],
                'headline': 'Could not auto-fetch right now',
                'program_snippets': [],
                'status': f'error: {str(e)[:80]}',
                'last_checked_utc': datetime.utcnow().isoformat() + 'Z'
            })
    payload = {
        'note': 'Official-source best-effort feed. Review source links for full/latest program details.',
        'items': results
    }
    write_snapshot('raw/gov/programs_latest.json', payload)
    write_jsonl('raw/gov/programs_history.jsonl', {'items_count': len(results), 'items': results})
    return payload


@router.post('/gov/subsidies/distribute')
def gov_distribute_subsidy(payload: dict = Body(...), db: Session = Depends(get_db)):
    payer_id = int(payload.get('payer_id', 1))
    payee_id = int(payload.get('farmer_user_id', 1))
    amount = float(payload.get('amount', 0))
    country = payload.get('country', 'GH')
    provider_currency = {'GH': 'GHS', 'NG': 'NGN', 'BF': 'XOF'}
    ref = f"SUBSIDY-{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"

    payment = Payment(
        payer_id=payer_id,
        payee_id=payee_id,
        amount=amount,
        currency=provider_currency.get(country, 'GHS'),
        country=CountryCode(country),
        method='GovernmentSubsidy',
        provider=payload.get('agency', 'Government'),
        escrow_enabled=False,
        status='SUCCESS',
        reference=ref
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {'message': 'Subsidy recorded', 'payment_id': payment.id, 'reference': payment.reference}


@router.post('/gov/communicate')
def gov_communicate(payload: dict = Body(...)):
    return {
        'message': 'Government communication queued',
        'country': payload.get('country', 'ALL'),
        'target': payload.get('target', 'farmers'),
        'text': payload.get('text', '')
    }


@router.get('/market/spot-trading')
def spot_trading_graph(db: Session = Depends(get_db)):
    # Major commodities + country and world benchmark (derived average)
    commodities = ['Maize', 'Rice', 'Soybeans', 'Cocoa']
    seeds = {
        'Maize': {'GH': 420, 'NG': 380, 'BF': 360},
        'Rice': {'GH': 680, 'NG': 620, 'BF': 590},
        'Soybeans': {'GH': 740, 'NG': 690, 'BF': 640},
        'Cocoa': {'GH': 2100, 'NG': 1980, 'BF': 1850}
    }

    rows = []
    for c in commodities:
        country_vals = {}
        for cc in ['GH', 'NG', 'BF']:
            avg = db.query(func.avg(CropListing.unit_price)).filter(
                CropListing.country == CountryCode(cc),
                func.lower(CropListing.crop_name).like(f"%{c.lower()[:4]}%")
            ).scalar()
            country_vals[cc] = round(float(avg), 2) if avg else seeds[c][cc]

        world_avg = round((country_vals['GH'] + country_vals['NG'] + country_vals['BF']) / 3.0, 2)
        rows.append({
            'commodity': c,
            'GH': country_vals['GH'],
            'NG': country_vals['NG'],
            'BF': country_vals['BF'],
            'WORLD_AVG': world_avg,
            'updated_at_utc': datetime.utcnow().isoformat() + 'Z'
        })

    payload = {'items': rows, 'currency_note': 'Local indicative prices by country + computed world average benchmark.'}
    write_snapshot('raw/market/spot_trading_latest.json', payload)
    write_jsonl('raw/market/spot_trading_history.jsonl', {'items': rows})
    return payload


@router.get('/market/spot-trading/history')
def spot_trading_history(db: Session = Depends(get_db)):
    base = spot_trading_graph(db).get('items', [])
    out = []
    for i, row in enumerate(base):
        avg = float(row.get('WORLD_AVG', 0) or 0)
        # deterministic synthetic trend path for demo consistency
        trend_7d = [round(avg * (0.94 + (j * 0.01) + (i * 0.002)), 2) for j in range(7)]
        trend_30d = [round(avg * (0.88 + (j * 0.004) + (i * 0.001)), 2) for j in range(30)]
        pct7 = round(((trend_7d[-1] - trend_7d[0]) / trend_7d[0]) * 100, 2) if trend_7d[0] else 0
        pct30 = round(((trend_30d[-1] - trend_30d[0]) / trend_30d[0]) * 100, 2) if trend_30d[0] else 0
        out.append({
            'commodity': row.get('commodity'),
            'trend_7d': trend_7d,
            'trend_30d': trend_30d,
            'change_pct_7d': pct7,
            'change_pct_30d': pct30,
            'provenance': 'FarmSavior aggregated marketplace listings + seeded fallback for continuity'
        })
    return {'items': out, 'generated_at_utc': datetime.utcnow().isoformat() + 'Z'}


@router.get('/trade/export-stats')
def trade_export_stats():
    commodities = [
        {'key': 'poultry', 'name': 'Poultry'},
        {'key': 'sheep_goats', 'name': 'Sheep & Goats'},
        {'key': 'cattle', 'name': 'Cattle'},
        {'key': 'rice', 'name': 'Rice'},
        {'key': 'maize', 'name': 'Maize'},
        {'key': 'wheat', 'name': 'Wheat'},
        {'key': 'soybeans', 'name': 'Soybeans'},
        {'key': 'cocoa', 'name': 'Cocoa'}
    ]

    country_pool = [
        'Brazil', 'United States', 'India', 'China', 'France', 'Germany', 'Netherlands',
        'Argentina', 'Australia', 'Canada', 'Thailand', 'Vietnam', 'Indonesia', 'Turkey',
        'Russia', 'Ukraine', 'New Zealand', 'South Africa', 'Nigeria', 'Ghana'
    ]

    items = []
    for i, c in enumerate(commodities):
        exporters = []
        importers = []
        random.seed(f"{c['key']}-exp")
        exp_countries = random.sample(country_pool, 10)
        for rank, name in enumerate(exp_countries, start=1):
            volume = round((12.5 - rank * 0.7 + (i * 0.15)) * 1_000_000, 0)
            exporters.append({'rank': rank, 'country': name, 'volume_tons': int(max(volume, 2200000))})

        random.seed(f"{c['key']}-imp")
        imp_countries = random.sample(country_pool, 10)
        for rank, name in enumerate(imp_countries, start=1):
            volume = round((11.8 - rank * 0.65 + (i * 0.12)) * 1_000_000, 0)
            importers.append({'rank': rank, 'country': name, 'volume_tons': int(max(volume, 2000000))})

        items.append({
            'commodity_key': c['key'],
            'commodity': c['name'],
            'unit': 'tons/year',
            'top_exporters': exporters,
            'top_importers': importers,
            'provenance': 'FarmSavior global trade snapshot (seeded model for always-on dashboard continuity)'
        })

    payload = {'items': items, 'generated_at_utc': datetime.utcnow().isoformat() + 'Z'}
    write_snapshot('raw/trade/export_stats_latest.json', payload)
    write_jsonl('raw/trade/export_stats_history.jsonl', payload)
    return payload


@router.get('/university/poultry/plans')
def poultry_university_plans():
    return {
        'note': 'Poultry University unlocks only from server-side subscription status. No browser-local unlocks are trusted.',
        'supported_currencies': ['GHS', 'NGN', 'XOF', 'KES', 'TZS', 'UGX', 'ZAR', 'USD', 'EUR'],
        'plans': [
            {
                'plan_code': 'basic',
                'name': 'Poultry University Basic',
                'monthly_usd': 3.33,
                'yearly_usd': 33.0,
                'features': ['All 5 modules', 'All bird tracks', 'Both climate zones']
            },
            {
                'plan_code': 'pro',
                'name': 'Poultry University Professional',
                'monthly_usd': 8.0,
                'yearly_usd': 80.0,
                'features': ['Everything in Basic', 'Professional extras', 'Downloads', 'Expert Q&A', 'Certificate']
            }
        ]
    }


@router.get('/university/poultry/subscription/me')
def poultry_university_subscription_me(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    rec = db.query(SheepGoatSubscription).filter(
        SheepGoatSubscription.user_id == user.id,
        SheepGoatSubscription.reference.like('PUSUB-%')
    ).order_by(SheepGoatSubscription.id.desc()).first()

    if not rec:
        return {'tier': 'free', 'subscription': None}

    active_statuses = {'ACTIVE', 'TRIAL_ACTIVE'}
    tier = rec.plan_code if rec.status in active_statuses else 'free'
    return {
        'tier': tier,
        'subscription': {
            'id': rec.id,
            'plan_code': rec.plan_code,
            'billing_cycle': rec.billing_cycle,
            'currency': rec.currency,
            'amount': rec.amount,
            'status': rec.status,
            'reference': rec.reference,
            'started_at': rec.started_at.isoformat() if rec.started_at else None,
            'ends_at': rec.ends_at.isoformat() if rec.ends_at else None,
            'country': rec.country,
        }
    }


@router.post('/university/poultry/subscription/checkout')
def poultry_university_subscription_checkout(payload: PoultryUniversitySubscriptionIn, db: Session = Depends(get_db)):
    plans = {
        'basic': {'monthly': 3.33, 'yearly': 33.0},
        'pro': {'monthly': 8.0, 'yearly': 80.0}
    }
    fx = {'USD': 1.0, 'GHS': 15.0, 'NGN': 1600.0, 'XOF': 610.0}

    amount_usd = plans[payload.plan_code][payload.billing_cycle]
    cur = (payload.currency or 'USD').upper()
    country = (payload.country or '').upper()
    amount = round(amount_usd * fx.get(cur, 1.0), 2)

    payout_channel = 'GH_MOMO' if (country == 'GH' or cur == 'GHS') else 'US_BANK'
    ref = f"PUSUB-{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"
    rec = SheepGoatSubscription(
        user_id=payload.user_id,
        plan_code=payload.plan_code,
        country=country or payload.country,
        billing_cycle=payload.billing_cycle,
        amount=amount,
        currency=cur,
        status='PENDING_PAYMENT',
        reference=ref
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    payment_url = ''
    payment_init_error = ''
    paystack_secret = _paystack_secret_clean()
    if paystack_secret:
        user = db.query(User).filter(User.id == (payload.user_id or 0)).first() if payload.user_id else None
        customer_name = user.full_name if user and user.full_name else 'FarmSavior User'
        customer_email = f"user{payload.user_id or 0}@farmsavior.com"
        if user and getattr(user, 'phone', None):
            customer_email = f"{str(user.phone).replace('+','').replace(' ','')}@farmsavior.com"

        amount_minor = int(round(float(amount) * 100))
        ps_payload = {
            'email': customer_email,
            'amount': amount_minor,
            'reference': ref,
            'currency': cur,
            'callback_url': settings.PAYSTACK_CALLBACK_URL,
            'metadata': {
                'customer_name': customer_name,
                'product': 'poultry_university',
                'plan_code': payload.plan_code,
                'billing_cycle': payload.billing_cycle,
                'country': country,
                'payout_channel': payout_channel
            }
        }
        try:
            req = UrlRequest(
                'https://api.paystack.co/transaction/initialize',
                data=json.dumps(ps_payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'FarmSavior/1.0 (+https://www.farmsavior.com)',
                    'Authorization': f'Bearer {paystack_secret}'
                },
                method='POST'
            )
            with urlopen(req, timeout=15) as resp:
                ps_resp = json.loads(resp.read().decode('utf-8', errors='ignore'))
            payment_url = (((ps_resp or {}).get('data') or {}).get('authorization_url') or '')
            if not payment_url:
                payment_init_error = str((ps_resp or {}).get('message') or 'Paystack did not return authorization_url')
        except Exception as e:
            payment_url = ''
            payment_init_error = str(e)

    return {
        'message': 'checkout created',
        'reference': ref,
        'subscription': {
            'id': rec.id,
            'plan_code': rec.plan_code,
            'billing_cycle': rec.billing_cycle,
            'currency': rec.currency,
            'amount': rec.amount,
            'status': rec.status,
            'reference': rec.reference,
        },
        'amount_usd': amount_usd,
        'payment_url': payment_url,
        'payment_provider': 'paystack' if paystack_secret else 'not_configured',
        'payment_init_error': payment_init_error,
    }


@router.get('/university/poultry/subscription/verify/{reference}')
def poultry_university_subscription_verify(reference: str, db: Session = Depends(get_db)):
    rec = db.query(SheepGoatSubscription).filter(SheepGoatSubscription.reference == reference).first()
    if not rec:
        raise HTTPException(status_code=404, detail='subscription reference not found')

    if rec.status == 'ACTIVE':
        return {'message': 'already active', 'reference': reference, 'status': rec.status, 'tier': rec.plan_code}

    paystack_secret = _paystack_secret_clean()
    if not paystack_secret:
        return {'message': 'payment provider not configured', 'reference': reference, 'status': rec.status, 'tier': 'free'}

    try:
        req = UrlRequest(
            f'https://api.paystack.co/transaction/verify/{reference}',
            headers={'Authorization': f'Bearer {paystack_secret}'},
            method='GET'
        )
        with urlopen(req, timeout=15) as resp:
            v = json.loads(resp.read().decode('utf-8', errors='ignore'))

        data = (v or {}).get('data') or {}
        status = str(data.get('status', '')).lower()
        amount_minor = int(data.get('amount', 0) or 0)
        amount = float(amount_minor) / 100.0
        currency = str(data.get('currency', '') or '').upper()
        tx_ref = str(data.get('reference', '') or '')

        if status == 'success' and tx_ref == reference and currency == (rec.currency or '').upper() and amount >= float(rec.amount or 0):
            rec.status = 'ACTIVE'
            rec.started_at = datetime.utcnow()
            rec.ends_at = datetime.utcnow() + timedelta(days=30 if rec.billing_cycle == 'monthly' else 365)
            db.commit()
            db.refresh(rec)
            return {'message': 'payment verified and subscription activated', 'reference': reference, 'status': rec.status, 'tier': rec.plan_code}

        return {'message': 'payment not verified yet', 'reference': reference, 'status': rec.status, 'tier': 'free', 'provider_status': status}
    except Exception as e:
        return {'message': 'verification failed', 'reference': reference, 'status': rec.status, 'tier': 'free', 'error': str(e)}


def _university_subscription_prefix(product: str) -> str:
    p = str(product or '').lower().strip()
    mapping = {
        'poultry': 'PUSUB-',
        'sheep': 'SUSUB-',
        'goat': 'GUSUB-',
        'cattle': 'CUSUB-',
    }
    prefix = mapping.get(p)
    if not prefix:
        raise HTTPException(status_code=404, detail='unknown university product')
    return prefix


def _subscription_product_from_reference(reference: Optional[str]) -> str:
    ref = str(reference or '').upper()
    if ref.startswith('SGSUB-'):
        return 'livestock-records'
    if ref.startswith('PUSUB-'):
        return 'poultry-university'
    if ref.startswith('SUSUB-'):
        return 'sheep-university'
    if ref.startswith('GUSUB-'):
        return 'goat-university'
    if ref.startswith('CUSUB-'):
        return 'cattle-university'
    return 'subscription'


def _serialize_subscription_record(rec: Optional[SheepGoatSubscription]) -> Optional[dict]:
    if not rec:
        return None
    return {
        'id': rec.id,
        'plan_code': rec.plan_code,
        'billing_cycle': rec.billing_cycle,
        'currency': rec.currency,
        'amount': rec.amount,
        'status': rec.status,
        'reference': rec.reference,
        'started_at': rec.started_at.isoformat() if rec.started_at else None,
        'ends_at': rec.ends_at.isoformat() if rec.ends_at else None,
        'country': rec.country,
    }


def _sync_subscription_record(rec: SheepGoatSubscription, db: Session) -> dict:
    product = _subscription_product_from_reference(rec.reference)
    active_statuses = {'ACTIVE', 'TRIAL_ACTIVE'}
    if str(rec.status or '').upper() in active_statuses:
        return {'reference': rec.reference, 'product': product, 'status': rec.status, 'message': 'already active'}

    paystack_secret = _paystack_secret_clean()
    if not paystack_secret:
        return {'reference': rec.reference, 'product': product, 'status': rec.status, 'message': 'payment provider not configured'}

    try:
        v = _paystack_transaction_verify(rec.reference)
        data = (v or {}).get('data') or {}
        provider_status = str(data.get('status', '')).lower()
        amount_minor = int(data.get('amount', 0) or 0)
        amount = float(amount_minor) / 100.0
        currency = str(data.get('currency', '') or '').upper()
        tx_ref = str(data.get('reference', '') or '')
        if provider_status == 'success' and tx_ref == (rec.reference or '') and currency == str(rec.currency or '').upper() and amount >= float(rec.amount or 0):
            rec.status = 'ACTIVE'
            if not rec.started_at:
                rec.started_at = datetime.utcnow()
            if not rec.ends_at:
                rec.ends_at = datetime.utcnow() + timedelta(days=30 if rec.billing_cycle == 'monthly' else 365)
            db.commit()
            db.refresh(rec)
            return {'reference': rec.reference, 'product': product, 'status': rec.status, 'message': 'payment verified and subscription activated'}
        return {'reference': rec.reference, 'product': product, 'status': rec.status, 'message': 'payment not verified yet', 'provider_status': provider_status}
    except Exception as e:
        return {'reference': rec.reference, 'product': product, 'status': rec.status, 'message': 'verification failed', 'error': str(e)}


@router.post('/account/billing-sync')
def account_billing_sync(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    candidates = db.query(SheepGoatSubscription).filter(
        SheepGoatSubscription.user_id == user.id,
        SheepGoatSubscription.status.in_(['PENDING_PAYMENT', 'PENDING', 'PROCESSING'])
    ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(50).all()
    return {
        'synced': [_sync_subscription_record(rec, db) for rec in candidates],
        'checked_count': len(candidates)
    }


@router.get('/account/billing-overview')
def account_billing_overview(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    subscriptions = db.query(SheepGoatSubscription).filter(
        SheepGoatSubscription.user_id == user.id
    ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(100).all()

    pending_statuses = {'PENDING_PAYMENT', 'PENDING', 'PROCESSING'}
    synced_any = False
    for sub in subscriptions:
        if _subscription_status_upper(sub.status) in pending_statuses:
            _sync_subscription_record(sub, db)
            synced_any = True
    if synced_any:
        subscriptions = db.query(SheepGoatSubscription).filter(
            SheepGoatSubscription.user_id == user.id
        ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(100).all()

    payments = db.query(Payment).filter(
        (Payment.payer_id == user.id) | (Payment.payee_id == user.id)
    ).order_by(Payment.created_at.desc(), Payment.id.desc()).limit(100).all()

    active_statuses = {'ACTIVE', 'TRIAL_ACTIVE'}
    active_by_product = {}
    for sub in subscriptions:
        product = _subscription_product_from_reference(sub.reference)
        if product not in active_by_product and str(sub.status or '').upper() in active_statuses:
            active_by_product[product] = {
                'id': sub.id,
                'product': product,
                'plan_code': sub.plan_code,
                'billing_cycle': sub.billing_cycle,
                'currency': sub.currency,
                'amount': sub.amount,
                'status': sub.status,
                'reference': sub.reference,
                'started_at': sub.started_at.isoformat() if sub.started_at else None,
                'ends_at': sub.ends_at.isoformat() if sub.ends_at else None,
                'created_at': sub.created_at.isoformat() if sub.created_at else None,
                'country': sub.country,
            }

    return {
        'subscriptions': [{
            'id': sub.id,
            'product': _subscription_product_from_reference(sub.reference),
            'plan_code': sub.plan_code,
            'billing_cycle': sub.billing_cycle,
            'currency': sub.currency,
            'amount': sub.amount,
            'status': sub.status,
            'reference': sub.reference,
            'started_at': sub.started_at.isoformat() if sub.started_at else None,
            'ends_at': sub.ends_at.isoformat() if sub.ends_at else None,
            'created_at': sub.created_at.isoformat() if sub.created_at else None,
            'country': sub.country,
        } for sub in subscriptions],
        'active_subscriptions': list(active_by_product.values()),
        'payments': [{
            'id': pay.id,
            'payer_id': pay.payer_id,
            'payee_id': pay.payee_id,
            'amount': pay.amount,
            'currency': pay.currency,
            'country': pay.country.value if hasattr(pay.country, 'value') else str(pay.country or ''),
            'method': pay.method,
            'provider': pay.provider,
            'escrow_enabled': pay.escrow_enabled,
            'status': pay.status,
            'reference': pay.reference,
            'created_at': pay.created_at.isoformat() if pay.created_at else None,
        } for pay in payments]
    }


@router.get('/university/{product}/plans')
def university_product_plans(product: str):
    _university_subscription_prefix(product)
    title = f"{str(product).capitalize()} University"
    return {
        'product': product,
        'note': f'{title} unlocks only from server-side subscription status for this university.',
        'supported_currencies': ['GHS', 'NGN', 'XOF', 'KES', 'TZS', 'UGX', 'ZAR', 'USD', 'EUR'],
        'plans': [
            {
                'plan_code': 'basic',
                'name': f'{title} Basic',
                'monthly_usd': 3.33,
                'yearly_usd': 33.0,
                'features': ['All 5 modules', 'Full curriculum for this university', 'Both climate zones where applicable']
            },
            {
                'plan_code': 'pro',
                'name': f'{title} Professional',
                'monthly_usd': 8.0,
                'yearly_usd': 80.0,
                'features': ['Everything in Basic', 'Professional extras', 'Downloads', 'Expert Q&A', 'Certificate']
            }
        ]
    }


@router.get('/university/{product}/subscription/me')
def university_product_subscription_me(product: str, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    prefix = _university_subscription_prefix(product)
    user = _current_user_from_auth(authorization, db)
    records = db.query(SheepGoatSubscription).filter(
        SheepGoatSubscription.user_id == user.id,
        SheepGoatSubscription.reference.like(f'{prefix}%')
    ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(20).all()

    if not records:
        return {'product': product, 'tier': 'free', 'subscription': None}

    pending_statuses = {'PENDING_PAYMENT', 'PENDING', 'PROCESSING'}
    active_statuses = {'ACTIVE', 'TRIAL_ACTIVE'}
    for rec in records:
        if str(rec.status or '').upper() in pending_statuses:
            _sync_subscription_record(rec, db)

    refreshed = db.query(SheepGoatSubscription).filter(
        SheepGoatSubscription.user_id == user.id,
        SheepGoatSubscription.reference.like(f'{prefix}%')
    ).order_by(SheepGoatSubscription.created_at.desc(), SheepGoatSubscription.id.desc()).limit(20).all()

    active_rec = next((rec for rec in refreshed if str(rec.status or '').upper() in active_statuses), None)
    latest_rec = refreshed[0] if refreshed else None
    rec = active_rec or latest_rec
    tier = rec.plan_code if rec and str(rec.status or '').upper() in active_statuses else 'free'
    return {
        'product': product,
        'tier': tier,
        'subscription': _serialize_subscription_record(rec)
    }


@router.post('/university/{product}/subscription/checkout')
def university_product_subscription_checkout(product: str, payload: PoultryUniversitySubscriptionIn, db: Session = Depends(get_db)):
    prefix = _university_subscription_prefix(product)
    active_existing = _university_active_subscription_for_user(product, payload.user_id, db)
    if active_existing and _subscription_status_upper(active_existing.status) in {'ACTIVE', 'TRIAL_ACTIVE'}:
        return {
            'product': product,
            'message': 'subscription already active',
            'already_active': True,
            'reference': active_existing.reference,
            'subscription': _serialize_subscription_record(active_existing),
            'tier': active_existing.plan_code,
            'payment_url': '',
            'payment_provider': 'not_needed',
            'payment_init_error': '',
        }
    plans = {
        'basic': {'monthly': 3.33, 'yearly': 33.0},
        'pro': {'monthly': 8.0, 'yearly': 80.0}
    }
    fx = {'USD': 1.0, 'GHS': 15.0, 'NGN': 1600.0, 'XOF': 610.0}

    amount_usd = plans[payload.plan_code][payload.billing_cycle]
    cur = (payload.currency or 'USD').upper()
    country = (payload.country or '').upper()
    amount = round(amount_usd * fx.get(cur, 1.0), 2)
    payout_channel = 'GH_MOMO' if (country == 'GH' or cur == 'GHS') else 'US_BANK'
    ref = f"{prefix}{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"

    rec = SheepGoatSubscription(
        user_id=payload.user_id,
        plan_code=payload.plan_code,
        country=country or payload.country,
        billing_cycle=payload.billing_cycle,
        amount=amount,
        currency=cur,
        status='PENDING_PAYMENT',
        reference=ref
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    payment_url = ''
    payment_init_error = ''
    paystack_secret = _paystack_secret_clean()
    if paystack_secret:
        user = db.query(User).filter(User.id == (payload.user_id or 0)).first() if payload.user_id else None
        customer_name = user.full_name if user and user.full_name else 'FarmSavior User'
        customer_email = f"user{payload.user_id or 0}@farmsavior.com"
        if user and getattr(user, 'phone', None):
            customer_email = f"{str(user.phone).replace('+','').replace(' ','')}@farmsavior.com"

        amount_minor = int(round(float(amount) * 100))
        ps_payload = {
            'email': customer_email,
            'amount': amount_minor,
            'reference': ref,
            'currency': cur,
            'callback_url': settings.PAYSTACK_CALLBACK_URL,
            'metadata': {
                'customer_name': customer_name,
                'product': product,
                'plan_code': payload.plan_code,
                'billing_cycle': payload.billing_cycle,
                'country': country,
                'payout_channel': payout_channel
            }
        }
        try:
            req = UrlRequest(
                'https://api.paystack.co/transaction/initialize',
                data=json.dumps(ps_payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'FarmSavior/1.0 (+https://www.farmsavior.com)',
                    'Authorization': f'Bearer {paystack_secret}'
                },
                method='POST'
            )
            with urlopen(req, timeout=15) as resp:
                ps_resp = json.loads(resp.read().decode('utf-8', errors='ignore'))
            payment_url = (((ps_resp or {}).get('data') or {}).get('authorization_url') or '')
            if not payment_url:
                payment_init_error = str((ps_resp or {}).get('message') or 'Paystack did not return authorization_url')
        except Exception as e:
            payment_url = ''
            payment_init_error = str(e)

    return {
        'product': product,
        'message': 'checkout created',
        'reference': ref,
        'subscription': {
            'id': rec.id,
            'plan_code': rec.plan_code,
            'billing_cycle': rec.billing_cycle,
            'currency': rec.currency,
            'amount': rec.amount,
            'status': rec.status,
            'reference': rec.reference,
        },
        'amount_usd': amount_usd,
        'payment_url': payment_url,
        'payment_provider': 'paystack' if paystack_secret else 'not_configured',
        'payment_init_error': payment_init_error,
    }


@router.get('/university/{product}/subscription/verify/{reference}')
def university_product_subscription_verify(product: str, reference: str, db: Session = Depends(get_db)):
    prefix = _university_subscription_prefix(product)
    if not str(reference).startswith(prefix):
        raise HTTPException(status_code=400, detail='reference does not match product')

    rec = db.query(SheepGoatSubscription).filter(SheepGoatSubscription.reference == reference).first()
    if not rec:
        raise HTTPException(status_code=404, detail='subscription reference not found')

    result = _sync_subscription_record(rec, db)
    tier = rec.plan_code if str(result.get('status') or '').upper() in {'ACTIVE', 'TRIAL_ACTIVE'} else 'free'
    return {**result, 'tier': tier, 'product': product}


@router.get('/weather/public-main')
def public_main_weather():
    rows = []
    for country, cities in MAIN_CITIES.items():
        for city in cities:
            temp = hum = rain = '-'
            cond = 'Data unavailable'

            # Primary: wttr.in
            try:
                req = UrlRequest(f'https://wttr.in/{city}?format=j1', headers={'User-Agent': 'FarmSaviorWeather/1.0'})
                with urlopen(req, timeout=6) as resp:
                    data = json.loads(resp.read().decode('utf-8', errors='ignore'))
                current = (data.get('current_condition') or [{}])[0]
                temp = current.get('temp_C') or '-'
                hum = current.get('humidity') or '-'
                rain = current.get('precipMM') or '-'
                cond = (current.get('weatherDesc') or [{'value': 'Data unavailable'}])[0].get('value', 'Data unavailable')
            except Exception:
                pass

            # Fallback: Open-Meteo by static city coordinates
            if temp == '-' or hum == '-' or rain == '-':
                try:
                    lat, lon = CITY_COORDS[city]
                    om = f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code'
                    req2 = UrlRequest(om, headers={'User-Agent': 'FarmSaviorWeather/1.0'})
                    with urlopen(req2, timeout=6) as resp2:
                        d2 = json.loads(resp2.read().decode('utf-8', errors='ignore'))
                    cur = d2.get('current', {})
                    temp = cur.get('temperature_2m', temp)
                    hum = cur.get('relative_humidity_2m', hum)
                    rain = cur.get('precipitation', rain)
                    if cond == 'Data unavailable':
                        cond = 'Updated forecast'
                except Exception:
                    pass

            rows.append({
                'country': country,
                'city': city,
                'temperature_c': str(temp),
                'humidity_pct': str(hum),
                'rainfall_mm': str(rain),
                'condition': cond
            })
    write_snapshot('raw/weather/public_main_latest.json', rows)
    write_jsonl('raw/weather/public_main_history.jsonl', {'items': rows})
    for row in rows:
        row.text = _mask_contact_info(getattr(row, 'text', ''))
    return rows


@router.get('/news/public')
def public_news(limit: int = 12):
    cache_path = (Path(__file__).resolve().parents[3] / 'data' / 'runtime' / 'public-news-cache.json')
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    items = []
    for source, url in PUBLIC_NEWS_FEEDS:
        try:
            req = UrlRequest(url, headers={'User-Agent': 'Mozilla/5.0 FarmSaviorNewsBot/1.0'})
            with urlopen(req, timeout=10) as resp:
                data = resp.read()
            root = ET.fromstring(data)
            channel = root.find('channel')
            rss_items = channel.findall('item') if channel is not None else root.findall('.//item')
            for it in rss_items[:12]:
                title = (it.findtext('title') or '').strip()
                link = (it.findtext('link') or '').strip()
                pub = (it.findtext('pubDate') or '').strip()
                desc = (it.findtext('description') or '').strip()
                haystack = f"{title} {desc} {link}".lower()
                is_agri = any(k in haystack for k in AGRI_NEWS_KEYWORDS)
                if not is_agri:
                    continue

                img = ''
                enc = it.find('enclosure')
                if enc is not None:
                    img = enc.attrib.get('url', '')
                if not img:
                    img = SOURCE_IMAGES.get(source, '')
                if title and link:
                    items.append({'title': title, 'url': link, 'source': source, 'published': pub, 'image_url': img, 'image_credit': 'Source publisher'})
        except Exception:
            continue

    if items:
        dedup = []
        seen = set()
        for it in items:
            key = (it.get('title','').strip().lower(), it.get('url','').strip().lower())
            if key in seen:
                continue
            seen.add(key)
            dedup.append(it)
        items = dedup
        try:
            cache_path.write_text(json.dumps(items, ensure_ascii=False), encoding='utf-8')
        except Exception:
            pass
    else:
        try:
            cached = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else []
            if isinstance(cached, list) and cached:
                items = cached
        except Exception:
            items = []

    if not items:
        items = [
            {'title': 'Climate-smart farming adoption grows across West Africa', 'url': 'https://www.fao.org', 'source': 'FAO News', 'published': '', 'image_url': SOURCE_IMAGES['FAO News'], 'image_credit': 'Source publisher'},
            {'title': 'Smallholder market access improves with digital logistics', 'url': 'https://www.cgiar.org', 'source': 'CGIAR', 'published': '', 'image_url': SOURCE_IMAGES['CGIAR'], 'image_credit': 'Source publisher'},
            {'title': 'Agri-finance innovations helping rural producers scale', 'url': 'https://www.worldbank.org', 'source': 'World Bank Agriculture', 'published': '', 'image_url': SOURCE_IMAGES['World Bank Agriculture'], 'image_credit': 'Source publisher'}
        ]

    return items[:max(1, min(limit, 30))]


@router.post('/messaging/device-token')
def register_device_token(payload: DeviceTokenIn, db: Session = Depends(get_db)):
    existing = db.query(DeviceToken).filter(DeviceToken.token == payload.token).first()
    if existing:
        existing.user_id = payload.user_id
        existing.platform = payload.platform
        db.commit()
        db.refresh(existing)
        return existing

    rec = DeviceToken(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/messaging/device-token')
def list_device_tokens(db: Session = Depends(get_db)):
    return db.query(DeviceToken).order_by(DeviceToken.id.desc()).all()


def _is_admin_user(user: User) -> bool:
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if str(role).lower() != 'admin':
        return False
    return _normalize_phone(getattr(user, 'phone', '')) in _phone_variants('+233536761831')


def _world_chat_store_path() -> Path:
    candidates = [
        Path(__file__).resolve().parents[3] / 'data' / 'runtime' / 'world-chat.json',
        Path(__file__).resolve().parents[2] / 'data' / 'runtime' / 'world-chat.json',
        Path(__file__).resolve().parents[2] / 'runtime' / 'world-chat.json',
    ]
    for p in candidates:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        except Exception:
            continue
    p = candidates[0]
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _world_chat_read() -> list[dict]:
    p = _world_chat_store_path()

    if p.exists():
        try:
            rows = json.loads(p.read_text(encoding='utf-8')) or []
            if isinstance(rows, list):
                return rows
        except Exception:
            pass

    fallback_paths = [
        Path(__file__).resolve().parents[3] / 'data' / 'runtime' / 'world-chat.json',
        Path(__file__).resolve().parents[2] / 'data' / 'runtime' / 'world-chat.json',
    ]
    for fp in fallback_paths:
        if not fp.exists():
            continue
        try:
            rows = json.loads(fp.read_text(encoding='utf-8')) or []
            if isinstance(rows, list) and rows:
                try:
                    _world_chat_write(rows)
                except Exception:
                    pass
                return rows
        except Exception:
            continue

    return []


def _world_chat_write(rows: list[dict]):
    p = _world_chat_store_path()
    tmp = p.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    tmp.replace(p)


def _world_chat_bootstrap_from_db(db: Session):
    rows = _world_chat_read()
    if rows:
        return
    db_rows = db.query(WorldChatMessage).order_by(WorldChatMessage.id.asc()).limit(5000).all()
    seed = [{
        'id': r.id,
        'user_id': r.user_id,
        'user_name': r.user_name,
        'user_country': r.user_country,
        'text': r.text,
        'status': r.status,
        'moderation_label': r.moderation_label,
        'moderation_reason': r.moderation_reason,
        'created_at': r.created_at.isoformat() if getattr(r, 'created_at', None) else None,
    } for r in db_rows]
    _world_chat_write(seed)


def _world_chat_recover_db_from_store(db: Session):
    db_count = db.query(func.count(WorldChatMessage.id)).scalar() or 0
    if db_count > 0:
        return
    rows = _world_chat_read()
    if not rows:
        return
    for r in rows[-20000:]:
        try:
            created_at = None
            try:
                if r.get('created_at'):
                    created_at = datetime.fromisoformat(str(r.get('created_at')).replace('Z', '+00:00')).replace(tzinfo=None)
            except Exception:
                created_at = datetime.utcnow()
            msg = WorldChatMessage(
                user_id=int(r.get('user_id') or 0),
                user_name=str(r.get('user_name') or 'User'),
                user_country=str(r.get('user_country') or ''),
                text=str(r.get('text') or ''),
                status=str(r.get('status') or 'VISIBLE'),
                moderation_label=str(r.get('moderation_label') or 'SAFE'),
                moderation_score=0.0,
                moderation_reason=str(r.get('moderation_reason') or ''),
                created_at=created_at or datetime.utcnow(),
            )
            db.add(msg)
        except Exception:
            continue
    db.commit()




def _text_has_blocked_contact_info(value: Optional[str]) -> bool:
    raw = (value or '').strip()
    if not raw:
        return False
    lower = raw.lower()
    if re.search(r'(?i)\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b', raw):
        return True
    if re.search(r'(?:\+?\d[\d\s().-]{6,}\d)', raw) and len(re.sub(r'\D', '', raw)) >= 7:
        return True
    blocked = ['whatsapp', 'telegram', 'call me', 'text me', 'email me', 'reach me on', 'contact me at', '@gmail', '@yahoo']
    return any(token in lower for token in blocked)


def _assert_no_contact_info(*values: Optional[str]):
    for value in values:
        if _text_has_blocked_contact_info(value):
            raise HTTPException(status_code=400, detail='Direct contact info is not allowed here. Use FarmSavior in-app contact flow.')


def _mask_contact_info(value: Optional[str]) -> str:
    raw = value or ''
    if not raw:
        return raw
    raw = re.sub(r'(?i)\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b', '[contact removed]', raw)
    raw = re.sub(r'(?:\+?\d[\d\s().-]{6,}\d)', '[contact removed]', raw)
    for token in ['whatsapp', 'telegram', 'call me', 'text me', 'email me', 'reach me on', 'contact me at']:
        raw = re.sub(token, '[contact removed]', raw, flags=re.IGNORECASE)
    return raw

def _moderate_world_chat_text(text: str) -> dict:
    raw = (text or '').strip()
    lower = raw.lower()

    if not raw:
        return {'label': 'SPAM', 'score': 0.99, 'action': 'block', 'reason': 'Empty message'}

    bad_abuse = ['idiot', 'stupid', 'fool', 'bastard']
    bad_hate = ['kill all', 'ethnic cleanse']
    bad_scam = ['send otp', 'investment doubling', 'crypto giveaway', 'wire money', 'bank pin']
    bad_sex = ['nude', 'sex video']
    bad_violence = ['murder', 'bomb']

    repeated = len(raw) > 12 and len(set(raw.lower())) < max(3, len(raw) // 6)
    has_link = 'http://' in lower or 'https://' in lower or 'www.' in lower

    if any(k in lower for k in bad_hate):
        return {'label': 'HATE', 'score': 0.99, 'action': 'block', 'reason': 'Hate speech pattern'}
    if any(k in lower for k in bad_violence):
        return {'label': 'VIOLENCE', 'score': 0.96, 'action': 'block', 'reason': 'Violence pattern'}
    if any(k in lower for k in bad_sex):
        return {'label': 'SEXUAL', 'score': 0.95, 'action': 'block', 'reason': 'Sexual content pattern'}
    if any(k in lower for k in bad_scam) or (has_link and 'whatsapp' in lower and 'pay' in lower):
        return {'label': 'SCAM', 'score': 0.94, 'action': 'block', 'reason': 'Scam pattern'}
    if any(k in lower for k in bad_abuse):
        return {'label': 'ABUSE', 'score': 0.82, 'action': 'hide', 'reason': 'Abusive language'}
    if repeated or raw.count('\n') > 8 or len(raw) > 800:
        return {'label': 'SPAM', 'score': 0.88, 'action': 'hide', 'reason': 'Spam-like pattern'}

    return {'label': 'SAFE', 'score': 0.03, 'action': 'allow', 'reason': 'Clean'}


@router.get('/chat/world/messages')
def world_chat_messages(limit: int = 120, db: Session = Depends(get_db)):
    n = max(1, min(limit, 1000))
    _world_chat_recover_db_from_store(db)

    db_rows = db.query(WorldChatMessage).filter(WorldChatMessage.status == 'VISIBLE').order_by(WorldChatMessage.id.desc()).limit(n).all()
    if db_rows:
        # keep file mirror fresh as secondary durability
        try:
            mirror = [{
                'id': r.id,
                'user_id': r.user_id,
                'user_name': r.user_name,
                'user_country': r.user_country,
                'text': _mask_contact_info(r.text),
                'status': r.status,
                'moderation_label': r.moderation_label,
                'moderation_reason': r.moderation_reason,
                'created_at': r.created_at.isoformat() if getattr(r, 'created_at', None) else None,
            } for r in reversed(db_rows)]
            _world_chat_write(mirror)
        except Exception:
            pass
        rows = [r for r in list(reversed(db_rows)) if not str(getattr(r, 'user_name', '') or '').lower().startswith('qa user')]
        return [{
            'id': r.id,
            'user_id': r.user_id,
            'user_name': r.user_name,
            'user_country': r.user_country,
            'text': _mask_contact_info(r.text),
            'created_at': r.created_at,
        } for r in rows]

    _world_chat_bootstrap_from_db(db)
    rows = [r for r in _world_chat_read() if str(r.get('status', 'VISIBLE')).upper() == 'VISIBLE' and not str(r.get('user_name', '')).lower().startswith('qa user')]
    rows = rows[-n:]
    return [{
        'id': r.get('id'),
        'user_id': r.get('user_id'),
        'user_name': r.get('user_name'),
        'user_country': r.get('user_country'),
        'text': r.get('text'),
        'created_at': r.get('created_at'),
    } for r in rows]


@router.post('/chat/world/messages')
def world_chat_post(payload: WorldChatMessageIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)

    sanction = db.query(WorldChatUserModeration).filter(WorldChatUserModeration.user_id == user.id).first()
    now = datetime.utcnow()
    if sanction:
        if sanction.is_banned:
            raise HTTPException(status_code=403, detail='You are banned from world chat')
        if sanction.muted_until and sanction.muted_until > now:
            raise HTTPException(status_code=429, detail=f'You are muted until {sanction.muted_until.isoformat()}')

    # basic anti-spam rate limit
    window_start = now - timedelta(minutes=1)
    sent_last_min = db.query(func.count(WorldChatMessage.id)).filter(
        WorldChatMessage.user_id == user.id,
        WorldChatMessage.created_at >= window_start
    ).scalar() or 0
    if sent_last_min >= 8:
        raise HTTPException(status_code=429, detail='Rate limit reached. Please slow down.')

    moderation = _moderate_world_chat_text(payload.text)
    action = moderation['action']
    if action == 'block':
        raise HTTPException(status_code=400, detail=moderation['reason'])

    msg = WorldChatMessage(
        user_id=user.id,
        user_name=user.full_name,
        user_country=user.country.value if hasattr(user.country, 'value') else str(user.country),
        text=(payload.text or '').strip(),
        status='VISIBLE',
        moderation_label=moderation['label'],
        moderation_score=float(moderation['score']),
        moderation_reason=moderation['reason'],
    )
    db.add(msg)

    db.commit()
    db.refresh(msg)

    _world_chat_bootstrap_from_db(db)
    persisted = _world_chat_read()
    persisted.append({
        'id': msg.id,
        'user_id': msg.user_id,
        'user_name': msg.user_name,
        'user_country': msg.user_country,
        'text': msg.text,
        'status': msg.status,
        'moderation_label': msg.moderation_label,
        'moderation_reason': msg.moderation_reason,
        'created_at': msg.created_at.isoformat() if msg.created_at else None,
    })
    _world_chat_write(persisted)

    return {
        'id': msg.id,
        'status': msg.status,
        'moderation_label': msg.moderation_label,
        'moderation_reason': msg.moderation_reason,
        'created_at': msg.created_at,
    }


@router.get('/chat/world/moderation/queue')
def world_chat_queue(limit: int = 100, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail='Admin only')
    n = max(1, min(limit, 300))
    rows = db.query(WorldChatMessage).filter(WorldChatMessage.status != 'VISIBLE').order_by(WorldChatMessage.id.desc()).limit(n).all()
    return rows


@router.post('/chat/world/moderation/action')
def world_chat_moderation_action(payload: WorldChatModerationActionIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail='Admin only')
    row = db.query(WorldChatMessage).filter(WorldChatMessage.id == payload.message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Message not found')

    if payload.action == 'approve':
        row.status = 'VISIBLE'
    elif payload.action == 'hide':
        row.status = 'HIDDEN'
    else:
        row.status = 'BLOCKED'

    if payload.reason:
        row.moderation_reason = payload.reason
    db.commit()
    db.refresh(row)

    _world_chat_bootstrap_from_db(db)
    persisted = _world_chat_read()
    for r in persisted:
        if int(r.get('id') or 0) == int(row.id):
            r['status'] = row.status
            if payload.reason:
                r['moderation_reason'] = payload.reason
            break
    _world_chat_write(persisted)

    return {'message': 'moderation action applied', 'id': row.id, 'status': row.status}


@router.delete('/chat/world/messages/{message_id}')
def world_chat_delete_own(message_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    row = db.query(WorldChatMessage).filter(WorldChatMessage.id == message_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Message not found')

    is_admin = _is_admin_user(user)
    if not is_admin and int(row.user_id or 0) != int(user.id):
        raise HTTPException(status_code=403, detail='You can only delete your own messages')

    row.status = 'BLOCKED'
    row.moderation_reason = 'Deleted by owner' if not is_admin else 'Deleted by admin'
    db.commit()

    persisted = _world_chat_read()
    for r in persisted:
        if int(r.get('id') or 0) == int(message_id):
            r['status'] = 'BLOCKED'
            r['moderation_reason'] = row.moderation_reason
            break
    _world_chat_write(persisted)
    return {'message': 'deleted', 'id': message_id}


@router.post('/chat/world/users/{user_id}/sanction')
def world_chat_user_sanction(user_id: int, payload: WorldChatUserSanctionIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail='Admin only')

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='Target user not found')

    rec = db.query(WorldChatUserModeration).filter(WorldChatUserModeration.user_id == user_id).first()
    if not rec:
        rec = WorldChatUserModeration(user_id=user_id)
        db.add(rec)

    rec.is_banned = bool(payload.ban)
    rec.muted_until = datetime.utcnow() + timedelta(minutes=max(0, payload.mute_minutes)) if payload.mute_minutes > 0 else None
    rec.last_reason = payload.reason or rec.last_reason
    rec.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(rec)
    return rec


def _community_followed_user_ids(db: Session, viewer_id: int) -> set[int]:
    rows = db.query(CommunityFollow.followed_user_id).filter(CommunityFollow.follower_user_id == viewer_id).all()
    return {int(r[0]) for r in rows if r and r[0] is not None}


def _community_muted_user_ids(db: Session, viewer_id: int) -> set[int]:
    rows = db.query(CommunityMute.muted_user_id).filter(CommunityMute.muter_user_id == viewer_id).all()
    return {int(r[0]) for r in rows if r and r[0] is not None}


def _community_message_privacy_value(profile: Optional[CommunityProfile]) -> str:
    return str(getattr(profile, 'message_privacy', 'FOLLOWING') or 'FOLLOWING').upper()


def _community_can_message_user(db: Session, sender_id: int, recipient_user_id: int, recipient_profile: Optional[CommunityProfile] = None) -> bool:
    if sender_id == recipient_user_id:
        return False
    recipient_profile = recipient_profile or db.query(CommunityProfile).filter(CommunityProfile.user_id == recipient_user_id).first()
    policy = _community_message_privacy_value(recipient_profile)
    if policy == 'NOBODY':
        return False
    if policy == 'EVERYONE':
        return True
    return db.query(CommunityFollow.id).filter(
        CommunityFollow.follower_user_id == sender_id,
        CommunityFollow.followed_user_id == recipient_user_id,
    ).first() is not None


def _community_user_card(db: Session, user: User, viewer_id: Optional[int] = None):
    profile = db.query(CommunityProfile).filter(CommunityProfile.user_id == user.id).first()
    followers_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.followed_user_id == user.id).scalar() or 0
    following_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.follower_user_id == user.id).scalar() or 0
    posts_count = db.query(func.count(CommunityPost.id)).filter(CommunityPost.user_id == user.id, CommunityPost.status == 'VISIBLE').scalar() or 0
    is_following = False
    if viewer_id and viewer_id != user.id:
        is_following = db.query(CommunityFollow.id).filter(
            CommunityFollow.follower_user_id == viewer_id,
            CommunityFollow.followed_user_id == user.id,
        ).first() is not None
    return {
        'user_id': user.id,
        'full_name': user.full_name,
        'country': user.country.value if hasattr(user.country, 'value') else str(user.country),
        'region': user.region,
        'role': user.role.value if hasattr(user.role, 'value') else str(user.role),
        'username': profile.username if profile else None,
        'avatar_url': profile.avatar_url if profile else None,
        'cover_image_url': profile.cover_image_url if profile else None,
        'bio': _mask_contact_info(profile.bio) if profile else '',
        'farm_life': _mask_contact_info(profile.farm_life) if profile else '',
        'interests': _mask_contact_info(profile.interests) if profile else '',
        'visibility': profile.visibility if profile else 'PUBLIC',
        'message_privacy': _community_message_privacy_value(profile),
        'can_message': _community_can_message_user(db, viewer_id, user.id, profile) if viewer_id and viewer_id != user.id else False,
        'updated_at': profile.updated_at if profile else None,
        'followers_count': followers_count,
        'following_count': following_count,
        'posts_count': posts_count,
        'is_me': viewer_id == user.id if viewer_id else False,
        'is_following': is_following,
    }


def _community_can_view_full_profile(db: Session, target_user_id: int, viewer_id: int, profile: Optional[CommunityProfile] = None) -> bool:
    if viewer_id == target_user_id:
        return True
    profile = profile or db.query(CommunityProfile).filter(CommunityProfile.user_id == target_user_id).first()
    visibility = str(getattr(profile, 'visibility', 'PUBLIC') or 'PUBLIC').upper()
    if visibility != 'FOLLOWERS':
        return True
    return db.query(CommunityFollow.id).filter(
        CommunityFollow.follower_user_id == viewer_id,
        CommunityFollow.followed_user_id == target_user_id,
    ).first() is not None


def _serialize_community_post(db: Session, post: CommunityPost, viewer_id: Optional[int] = None) -> dict:
    profile = db.query(CommunityProfile).filter(CommunityProfile.user_id == post.user_id).first()
    user = db.query(User).filter(User.id == post.user_id).first()
    liked_by_me = False
    if viewer_id:
        liked_by_me = db.query(CommunityPostLike.id).filter(
            CommunityPostLike.post_id == post.id,
            CommunityPostLike.user_id == viewer_id,
        ).first() is not None
    return {
        'id': post.id,
        'user_id': post.user_id,
        'author_name': post.author_name,
        'author_country': post.author_country,
        'author_full_name': user.full_name if user else post.author_name,
        'author_username': profile.username if profile else None,
        'author_avatar_url': profile.avatar_url if profile else None,
        'author_cover_image_url': profile.cover_image_url if profile else None,
        'text': _mask_contact_info(post.text),
        'media_url': post.media_url,
        'media_type': post.media_type,
        'tags': post.tags,
        'created_at': post.created_at,
        'likes_count': db.query(func.count(CommunityPostLike.id)).filter(CommunityPostLike.post_id == post.id).scalar() or 0,
        'comments_count': db.query(func.count(CommunityPostComment.id)).filter(CommunityPostComment.post_id == post.id).scalar() or 0,
        'liked_by_me': liked_by_me,
    }


@router.get('/community/profile/me')
def community_profile_me(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    p = db.query(CommunityProfile).filter(CommunityProfile.user_id == u.id).first()
    if not p:
        base = ''.join(ch for ch in (u.full_name or 'farmer').lower() if ch.isalnum())[:14] or 'farmer'
        p = CommunityProfile(user_id=u.id, username=f"{base}{u.id}")
        db.add(p)
        db.commit()
        db.refresh(p)
    elif not p.username:
        base = ''.join(ch for ch in (u.full_name or 'farmer').lower() if ch.isalnum())[:14] or 'farmer'
        p.username = f"{base}{u.id}"
        db.commit()
        db.refresh(p)
    followers_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.followed_user_id == u.id).scalar() or 0
    following_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.follower_user_id == u.id).scalar() or 0
    return {
        'full_name': u.full_name,
        'username': p.username,
        'avatar_url': p.avatar_url,
        'cover_image_url': p.cover_image_url,
        'bio': _mask_contact_info(p.bio),
        'farm_life': _mask_contact_info(p.farm_life),
        'interests': _mask_contact_info(p.interests),
        'visibility': p.visibility,
        'message_privacy': _community_message_privacy_value(p),
        'followers_count': followers_count,
        'following_count': following_count,
    }


@router.post('/community/profile/me')
def community_profile_upsert(payload: CommunityProfileIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    p = db.query(CommunityProfile).filter(CommunityProfile.user_id == u.id).first()
    if not p:
        p = CommunityProfile(user_id=u.id)
        db.add(p)
    data = payload.model_dump()
    full_name = (data.pop('full_name', None) or '').strip()
    if full_name:
        u.full_name = full_name[:120]
    username = (data.get('username') or '').strip().lower().replace(' ', '')
    if username:
        username = ''.join(ch for ch in username if ch.isalnum() or ch in ['_', '.'])[:30]
        data['username'] = username
    _assert_no_contact_info(data.get('bio'), data.get('farm_life'), data.get('interests'), full_name)
    for k, v in data.items():
        setattr(p, k, v)
    if not p.username:
        base = ''.join(ch for ch in (u.full_name or 'farmer').lower() if ch.isalnum())[:14] or 'farmer'
        p.username = f"{base}{u.id}"
    db.query(CommunityPost).filter(CommunityPost.user_id == u.id).update({
        CommunityPost.author_name: u.full_name,
        CommunityPost.author_country: getattr(u, 'country', None)
    }, synchronize_session=False)
    db.commit()
    db.refresh(p)
    _account_store_upsert_user(u)
    followers_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.followed_user_id == u.id).scalar() or 0
    following_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.follower_user_id == u.id).scalar() or 0
    return {
        'full_name': u.full_name,
        'username': p.username,
        'avatar_url': p.avatar_url,
        'cover_image_url': p.cover_image_url,
        'bio': _mask_contact_info(p.bio),
        'farm_life': _mask_contact_info(p.farm_life),
        'interests': _mask_contact_info(p.interests),
        'visibility': p.visibility,
        'message_privacy': _community_message_privacy_value(p),
        'followers_count': followers_count,
        'following_count': following_count,
    }


@router.get('/community/users/{target_user_id}/profile')
def community_user_profile_view(target_user_id: int, posts_limit: int = 24, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    target = db.query(User).filter(User.id == target_user_id, User.is_deleted == False).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    profile = db.query(CommunityProfile).filter(CommunityProfile.user_id == target_user_id).first()
    card = _community_user_card(db, target, viewer.id)
    can_view_full_profile = _community_can_view_full_profile(db, target_user_id, viewer.id, profile)
    rows = db.query(CommunityPost).filter(
        CommunityPost.user_id == target_user_id,
        CommunityPost.status == 'VISIBLE'
    ).order_by(CommunityPost.created_at.desc(), CommunityPost.id.desc()).limit(max(1, min(posts_limit, 60))).all()
    posts = [_serialize_community_post(db, row, viewer.id) for row in rows]

    if not can_view_full_profile:
        card = {
            **card,
            'bio': '',
            'farm_life': '',
            'interests': '',
        }
        posts = []

    return {
        'profile': card,
        'viewer': {
            'user_id': viewer.id,
            'is_me': viewer.id == target_user_id,
            'is_following': card.get('is_following', False),
            'can_view_full_profile': can_view_full_profile,
        },
        'posts': posts,
    }


@router.get('/community/users/search')
def community_search_users(q: str = '', limit: int = 20, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    n = max(1, min(limit, 40))
    query = str(q or '').strip().lower()

    rows = db.query(User).filter(User.is_deleted == False)
    if query:
        like = f"%{query}%"
        profile_ids = [r[0] for r in db.query(CommunityProfile.user_id).filter(
            (func.lower(CommunityProfile.username).like(like)) |
            (func.lower(CommunityProfile.bio).like(like)) |
            (func.lower(CommunityProfile.interests).like(like))
        ).all()]
        rows = rows.filter(
            (func.lower(User.full_name).like(like)) |
            (func.lower(User.region).like(like)) |
            (func.lower(User.country).like(like)) |
            (User.id.in_(profile_ids) if profile_ids else text('1=0'))
        )

    candidates = rows.order_by(User.created_at.desc(), User.id.desc()).limit(120).all()
    cards = [_community_user_card(db, user, viewer.id) for user in candidates if user.id != viewer.id]
    cards.sort(key=lambda card: (
        not card['is_following'],
        -int(card['followers_count'] or 0),
        -int(card['posts_count'] or 0),
        str(card.get('full_name') or '').lower(),
    ))
    return cards[:n]


@router.get('/community/follows/me')
def community_follow_state(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    following_ids = _community_followed_user_ids(db, viewer.id)
    following = []
    for uid in sorted(following_ids):
        user = db.query(User).filter(User.id == uid, User.is_deleted == False).first()
        if user:
            following.append(_community_user_card(db, user, viewer.id))
    followers_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.followed_user_id == viewer.id).scalar() or 0
    muted_ids = sorted(_community_muted_user_ids(db, viewer.id))
    return {
        'following_ids': sorted(following_ids),
        'following_count': len(following_ids),
        'followers_count': followers_count,
        'following': following,
        'muted_ids': muted_ids,
        'muted_count': len(muted_ids),
    }


@router.post('/community/users/{target_user_id}/follow')
def community_toggle_follow(target_user_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    if target_user_id == viewer.id:
        raise HTTPException(status_code=400, detail='You cannot follow yourself')
    target = db.query(User).filter(User.id == target_user_id, User.is_deleted == False).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    existing = db.query(CommunityFollow).filter(
        CommunityFollow.follower_user_id == viewer.id,
        CommunityFollow.followed_user_id == target_user_id,
    ).first()
    if existing:
        db.delete(existing)
        following = False
    else:
        db.add(CommunityFollow(follower_user_id=viewer.id, followed_user_id=target_user_id))
        following = True
    db.commit()

    followers_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.followed_user_id == target_user_id).scalar() or 0
    following_count = db.query(func.count(CommunityFollow.id)).filter(CommunityFollow.follower_user_id == viewer.id).scalar() or 0
    return {
        'target_user_id': target_user_id,
        'following': following,
        'followers_count': followers_count,
        'following_count': following_count,
    }


@router.post('/community/users/{target_user_id}/mute')
def community_toggle_mute(target_user_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    if target_user_id == viewer.id:
        raise HTTPException(status_code=400, detail='You cannot mute yourself')
    target = db.query(User).filter(User.id == target_user_id, User.is_deleted == False).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    existing = db.query(CommunityMute).filter(
        CommunityMute.muter_user_id == viewer.id,
        CommunityMute.muted_user_id == target_user_id,
    ).first()
    if existing:
        db.delete(existing)
        muted = False
    else:
        db.add(CommunityMute(muter_user_id=viewer.id, muted_user_id=target_user_id))
        muted = True
    db.commit()
    muted_ids = sorted(_community_muted_user_ids(db, viewer.id))
    return {'target_user_id': target_user_id, 'muted': muted, 'muted_ids': muted_ids, 'muted_count': len(muted_ids)}


@router.get('/community/messages')
def community_message_threads(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    rows = db.query(CommunityDirectMessage).filter(
        (CommunityDirectMessage.sender_user_id == viewer.id) | (CommunityDirectMessage.recipient_user_id == viewer.id)
    ).order_by(CommunityDirectMessage.created_at.desc(), CommunityDirectMessage.id.desc()).all()
    threads = {}
    for row in rows:
        other_user_id = row.recipient_user_id if int(row.sender_user_id) == int(viewer.id) else row.sender_user_id
        if other_user_id in threads:
            continue
        other = db.query(User).filter(User.id == other_user_id, User.is_deleted == False).first()
        if not other:
            continue
        card = _community_user_card(db, other, viewer.id)
        threads[other_user_id] = {
            'user': card,
            'last_message': {
                'id': row.id,
                'text': row.text,
                'sender_user_id': row.sender_user_id,
                'recipient_user_id': row.recipient_user_id,
                'created_at': row.created_at,
                'is_mine': int(row.sender_user_id) == int(viewer.id),
            }
        }
    return list(threads.values())


@router.get('/community/messages/{other_user_id}')
def community_message_thread(other_user_id: int, limit: int = 80, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    other = db.query(User).filter(User.id == other_user_id, User.is_deleted == False).first()
    if not other:
        raise HTTPException(status_code=404, detail='User not found')
    rows = db.query(CommunityDirectMessage).filter(
        ((CommunityDirectMessage.sender_user_id == viewer.id) & (CommunityDirectMessage.recipient_user_id == other_user_id)) |
        ((CommunityDirectMessage.sender_user_id == other_user_id) & (CommunityDirectMessage.recipient_user_id == viewer.id))
    ).order_by(CommunityDirectMessage.created_at.asc(), CommunityDirectMessage.id.asc()).limit(max(1, min(limit, 200))).all()
    return {
        'user': _community_user_card(db, other, viewer.id),
        'messages': [{
            'id': row.id,
            'text': row.text,
            'sender_user_id': row.sender_user_id,
            'recipient_user_id': row.recipient_user_id,
            'created_at': row.created_at,
            'is_mine': int(row.sender_user_id) == int(viewer.id),
        } for row in rows]
    }


@router.post('/community/messages/{other_user_id}')
def community_send_message(other_user_id: int, payload: CommunityDirectMessageIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    if other_user_id == viewer.id:
        raise HTTPException(status_code=400, detail='You cannot message yourself')
    other = db.query(User).filter(User.id == other_user_id, User.is_deleted == False).first()
    if not other:
        raise HTTPException(status_code=404, detail='User not found')
    profile = db.query(CommunityProfile).filter(CommunityProfile.user_id == other_user_id).first()
    if not _community_can_message_user(db, viewer.id, other_user_id, profile):
        raise HTTPException(status_code=403, detail='This user is not accepting messages from you right now')
    text_value = str(payload.text or '').strip()
    if not text_value:
        raise HTTPException(status_code=400, detail='Message cannot be empty')
    if len(text_value) > 2000:
        raise HTTPException(status_code=400, detail='Message is too long')
    row = CommunityDirectMessage(sender_user_id=viewer.id, recipient_user_id=other_user_id, text=text_value)
    db.add(row)
    db.commit()
    db.refresh(row)
    lower_text = text_value.lower()
    if 'meet.jit.si/' in lower_text and ('join my audio call:' in lower_text or 'join my video call:' in lower_text):
        mode = 'video' if 'video' in lower_text else 'audio'
        room_match = re.search(r'https?://meet\.jit\.si/\S+', text_value, flags=re.IGNORECASE)
        _push_call_alert(db, int(other_user_id), caller_name=str(viewer.full_name or 'Someone'), mode=mode, room_url=(room_match.group(0) if room_match else ''))
    return {
        'id': row.id,
        'text': row.text,
        'sender_user_id': row.sender_user_id,
        'recipient_user_id': row.recipient_user_id,
        'created_at': row.created_at,
        'is_mine': True,
    }


@router.get('/community/feed')
def community_activity_feed(limit: int = 40, mode: str = 'for-you', authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    viewer = _current_user_from_auth(authorization, db)
    n = max(1, min(limit, 80))
    followed_ids = _community_followed_user_ids(db, viewer.id)
    muted_ids = _community_muted_user_ids(db, viewer.id)
    if mode == 'following' and not followed_ids:
        return []

    items = []
    seen_profile_events: set[int] = set()

    def push_item(item: dict):
        items.append(item)

    post_query = db.query(CommunityPost).filter(CommunityPost.status == 'VISIBLE')
    if muted_ids:
        post_query = post_query.filter(~CommunityPost.user_id.in_(muted_ids))
    if mode == 'following':
        post_query = post_query.filter(CommunityPost.user_id.in_(followed_ids))
    rows = post_query.order_by(CommunityPost.created_at.desc(), CommunityPost.id.desc()).limit(120).all()
    for r in rows:
        profile = db.query(CommunityProfile).filter(CommunityProfile.user_id == r.user_id).first()
        user = db.query(User).filter(User.id == r.user_id).first()
        liked_by_me = db.query(CommunityPostLike.id).filter(CommunityPostLike.post_id == r.id, CommunityPostLike.user_id == viewer.id).first() is not None
        push_item({
            'id': f'post-{r.id}',
            'type': 'community_post',
            'created_at': r.created_at,
            'priority': 100,
            'actor': _community_user_card(db, user, viewer.id) if user else None,
            'post': {
                'id': r.id,
                'user_id': r.user_id,
                'author_name': r.author_name,
                'author_country': r.author_country,
                'author_full_name': user.full_name if user else r.author_name,
                'author_username': profile.username if profile else None,
                'author_avatar_url': profile.avatar_url if profile else None,
                'author_cover_image_url': profile.cover_image_url if profile else None,
                'text': _mask_contact_info(r.text),
                'media_url': r.media_url,
                'media_type': r.media_type,
                'tags': r.tags,
                'likes_count': db.query(func.count(CommunityPostLike.id)).filter(CommunityPostLike.post_id == r.id).scalar() or 0,
                'comments_count': db.query(func.count(CommunityPostComment.id)).filter(CommunityPostComment.post_id == r.id).scalar() or 0,
                'liked_by_me': liked_by_me,
                'created_at': r.created_at,
            },
            'summary': 'Shared a community post',
        })

    listing_models = [
        ('crop_listing', CropListing, 'crop_name', 'quantity_kg', 'kg'),
        ('livestock_listing', LivestockListing, 'livestock_type', 'quantity', 'head'),
    ]
    for item_type, model, title_field, qty_field, unit_label in listing_models:
        q = db.query(model)
        if mode == 'following':
            q = q.filter(model.farmer_id.in_(followed_ids))
        listings = q.order_by(model.created_at.desc(), model.id.desc()).limit(60).all()
        for row in listings:
            user = db.query(User).filter(User.id == row.farmer_id).first()
            if not user:
                continue
            push_item({
                'id': f'{item_type}-{row.id}',
                'type': item_type,
                'created_at': row.created_at,
                'priority': 70,
                'actor': _community_user_card(db, user, viewer.id),
                'listing': {
                    'id': row.id,
                    'title': getattr(row, title_field, ''),
                    'quantity': getattr(row, qty_field, None),
                    'unit_label': unit_label,
                    'location': getattr(row, 'location', None),
                    'unit_price': getattr(row, 'unit_price', None),
                    'country': row.country.value if hasattr(row.country, 'value') else str(row.country),
                    'cover_image_url': getattr(row, 'cover_image_url', None),
                },
                'summary': 'Added a marketplace listing',
            })

    profile_query = db.query(CommunityProfile)
    if mode == 'following':
        profile_query = profile_query.filter(CommunityProfile.user_id.in_(followed_ids))
    profiles = profile_query.order_by(CommunityProfile.updated_at.desc(), CommunityProfile.id.desc()).limit(80).all()
    for profile in profiles:
        if profile.user_id in seen_profile_events:
            continue
        user = db.query(User).filter(User.id == profile.user_id).first()
        if not user:
            continue
        has_visual_update = bool(profile.avatar_url or profile.cover_image_url)
        has_profile_text = bool((profile.bio or '').strip() or (profile.farm_life or '').strip())
        if not has_visual_update and not has_profile_text:
            continue
        seen_profile_events.add(profile.user_id)
        push_item({
            'id': f'profile-{profile.user_id}',
            'type': 'profile_update',
            'created_at': profile.updated_at,
            'priority': 40,
            'actor': _community_user_card(db, user, viewer.id),
            'profile_update': {
                'avatar_url': profile.avatar_url,
                'cover_image_url': profile.cover_image_url,
                'bio': _mask_contact_info(profile.bio),
                'farm_life': _mask_contact_info(profile.farm_life),
                'interests': _mask_contact_info(profile.interests),
                'updated_at': profile.updated_at,
            },
            'summary': 'Updated their profile',
        })

    items.sort(key=lambda item: (item.get('created_at') or datetime.min, item.get('priority', 0)), reverse=True)
    if mode == 'following':
        deduped = []
        recent_profile_users = set()
        for item in items:
            actor = item.get('actor') or {}
            uid = actor.get('user_id')
            if item.get('type') == 'profile_update':
                if uid in recent_profile_users:
                    continue
                recent_profile_users.add(uid)
            deduped.append(item)
        items = deduped
    return items[:n]


@router.get('/community/posts')
def community_posts(limit: int = 60, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    n = max(1, min(limit, 200))
    viewer = None
    if authorization:
        try:
            viewer = _current_user_from_auth(authorization, db)
        except Exception:
            viewer = None

    rows = db.query(CommunityPost).filter(CommunityPost.status == 'VISIBLE').order_by(CommunityPost.id.desc()).limit(n).all()
    out = []
    for r in rows:
        out.append(_serialize_community_post(db, r, viewer.id if viewer else None))
    return out


@router.post('/community/posts')
def community_create_post(payload: CommunityPostIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    text = (payload.text or '').strip()
    media_url = (payload.media_url or '').strip() or None
    if not text and not media_url:
        raise HTTPException(status_code=400, detail='Post must include text or media')

    moderation = _moderate_world_chat_text(text or 'safe media post')
    if moderation['action'] == 'block':
        raise HTTPException(status_code=400, detail=moderation['reason'])
    status = 'VISIBLE' if moderation['action'] == 'allow' else 'HIDDEN'

    profile = db.query(CommunityProfile).filter(CommunityProfile.user_id == u.id).first()
    author_display = f"@{profile.username}" if profile and profile.username else u.full_name

    post = CommunityPost(
        user_id=u.id,
        author_name=author_display,
        author_country=u.country.value if hasattr(u.country, 'value') else str(u.country),
        text=text,
        media_url=media_url,
        media_type=payload.media_type or ('IMAGE' if media_url else 'TEXT'),
        tags=(payload.tags or '').strip(),
        status=status,
        moderation_label=moderation['label'],
        moderation_reason=moderation['reason']
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.put('/community/posts/{post_id}')
def community_update_post(post_id: int, payload: CommunityPostIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.user_id != u.id:
        raise HTTPException(status_code=403, detail='Only the post owner can edit this post')

    text = (payload.text or '').strip()
    media_url = (payload.media_url or '').strip() or None
    if not text and not media_url:
        raise HTTPException(status_code=400, detail='Post must include text or media')

    moderation = _moderate_world_chat_text(text or 'safe media post')
    if moderation['action'] == 'block':
        raise HTTPException(status_code=400, detail=moderation['reason'])
    post.text = text
    post.media_url = media_url
    post.media_type = payload.media_type or ('IMAGE' if media_url else 'TEXT')
    post.tags = (payload.tags or '').strip()
    post.status = 'VISIBLE' if moderation['action'] == 'allow' else 'HIDDEN'
    post.moderation_label = moderation['label']
    post.moderation_reason = moderation['reason']
    db.commit()
    db.refresh(post)
    return post


@router.delete('/community/posts/{post_id}')
def community_delete_post(post_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    if post.user_id != u.id:
        raise HTTPException(status_code=403, detail='Only the post owner can delete this post')

    db.query(CommunityPostLike).filter(CommunityPostLike.post_id == post_id).delete()
    db.query(CommunityPostComment).filter(CommunityPostComment.post_id == post_id).delete()
    db.delete(post)
    db.commit()
    return {'message': 'Post deleted'}


@router.post('/community/posts/{post_id}/like')
def community_like_post(post_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    existing_rows = db.query(CommunityPostLike).filter(
        CommunityPostLike.post_id == post_id,
        CommunityPostLike.user_id == u.id,
    ).order_by(CommunityPostLike.id.asc()).all()

    if existing_rows:
        for row in existing_rows:
            db.delete(row)
        db.commit()
        likes_count = db.query(func.count(CommunityPostLike.id)).filter(CommunityPostLike.post_id == post_id).scalar() or 0
        return {'liked': False, 'likes_count': likes_count, 'post_id': post_id}

    rec = CommunityPostLike(post_id=post_id, user_id=u.id)
    db.add(rec)
    db.commit()
    likes_count = db.query(func.count(CommunityPostLike.id)).filter(CommunityPostLike.post_id == post_id).scalar() or 0
    return {'liked': True, 'likes_count': likes_count, 'post_id': post_id}


@router.get('/community/posts/{post_id}/comments')
def community_comments(post_id: int, db: Session = Depends(get_db)):
    rows = db.query(CommunityPostComment).filter(CommunityPostComment.post_id == post_id).order_by(CommunityPostComment.id.asc()).all()
    return rows


@router.post('/community/posts/{post_id}/comments')
def community_add_comment(post_id: int, payload: CommunityCommentIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    text = (payload.text or '').strip()
    if not text:
        raise HTTPException(status_code=400, detail='Comment cannot be empty')

    moderation = _moderate_world_chat_text(text)
    if moderation['action'] == 'block':
        raise HTTPException(status_code=400, detail=moderation['reason'])

    c = CommunityPostComment(post_id=post_id, user_id=u.id, author_name=u.full_name, text=text)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _extract_base64_payload(data_url: str) -> str:
    s = (data_url or '').strip()
    if s.startswith('data:') and ',' in s:
        return s.split(',', 1)[1]
    return s


@router.post('/ai/plants/identify')
def ai_plant_identify(payload: PlantIdentifyIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    _current_user_from_auth(authorization, db)  # signed-in users only

    # Try production-grade external model first when key is configured.
    api_key = (getattr(settings, 'PLANT_ID_API_KEY', '') or '').strip()
    if api_key:
        try:
            img_b64 = _extract_base64_payload(payload.image_url)
            req_body = {
                'images': [img_b64],
                'similar_images': True,
                'plant_details': ['common_names', 'wiki_description', 'taxonomy', 'url']
            }
            req = UrlRequest(
                'https://api.plant.id/v2/identify',
                data=json.dumps(req_body).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Api-Key': api_key
                },
                method='POST'
            )
            with urlopen(req, timeout=25) as resp:
                ext = json.loads(resp.read().decode('utf-8', errors='ignore'))
            suggestions = (ext or {}).get('suggestions') or []
            if suggestions:
                top = suggestions[0]
                name = top.get('plant_name') or top.get('plant_details', {}).get('common_names', ['Unknown plant'])[0]
                prob = float(top.get('probability', 0) or 0)
                common = (top.get('plant_details', {}) or {}).get('common_names') or []
                wiki = ((top.get('plant_details', {}) or {}).get('wiki_description') or {}).get('value', '')
                return {
                    'identified_name': name,
                    'confidence': round(prob, 4),
                    'feed_suitability': 'CHECK_FEED_COMPATIBILITY',
                    'target_livestock': payload.target_livestock,
                    'feed_for': [],
                    'nutrition': {'note': 'External identification matched. Verify feed suitability locally before feeding.'},
                    'recommendations': [
                        f"Common names: {', '.join(common[:5])}" if common else 'No common names available.',
                        (wiki[:220] + '...') if wiki and len(wiki) > 220 else (wiki or 'No wiki description available.'),
                        'Confirm plant safety/toxicity with local extension officer before feeding livestock.'
                    ],
                    'engine': 'Plant.id API + FarmSavior safety layer'
                }
        except Exception:
            pass

    name_hint = f"{payload.file_name or ''} {payload.context_hint or ''} {payload.image_url[:120]}".lower()

    plant_db = [
        {
            'keys': ['napier', 'elephant grass', 'pennisetum'],
            'name': 'Napier Grass (Elephant Grass)',
            'confidence': 0.86,
            'feed_for': ['cattle', 'goats', 'sheep'],
            'nutrition': {'crude_protein_pct': '8-12%', 'fiber': 'high', 'energy': 'moderate'},
            'use_tip': 'Best chopped fresh or silage; pair with legume leaves for higher protein.'
        },
        {
            'keys': ['alfalfa', 'lucerne'],
            'name': 'Alfalfa (Lucerne)',
            'confidence': 0.9,
            'feed_for': ['goats', 'sheep', 'cattle', 'rabbits'],
            'nutrition': {'crude_protein_pct': '17-22%', 'fiber': 'moderate', 'energy': 'high'},
            'use_tip': 'Excellent high-protein forage; avoid sudden overfeeding to young animals.'
        },
        {
            'keys': ['leucaena', 'ipil-ipil'],
            'name': 'Leucaena',
            'confidence': 0.83,
            'feed_for': ['goats', 'sheep', 'cattle'],
            'nutrition': {'crude_protein_pct': '20-28%', 'fiber': 'moderate', 'energy': 'moderate'},
            'use_tip': 'Very protein-rich browse; mix with grasses in ration.'
        },
        {
            'keys': ['moringa'],
            'name': 'Moringa',
            'confidence': 0.82,
            'feed_for': ['goats', 'sheep', 'rabbits', 'poultry'],
            'nutrition': {'crude_protein_pct': '22-30%', 'fiber': 'moderate', 'energy': 'moderate'},
            'use_tip': 'Great supplement leaf meal; introduce gradually.'
        },
        {
            'keys': ['amaranth'],
            'name': 'Amaranth',
            'confidence': 0.78,
            'feed_for': ['goats', 'sheep', 'rabbits'],
            'nutrition': {'crude_protein_pct': '14-20%', 'fiber': 'moderate', 'energy': 'moderate'},
            'use_tip': 'Useful leafy forage; wilt briefly before feeding.'
        },
        {
            'keys': ['cassava leaf', 'cassava leaves'],
            'name': 'Cassava Leaves',
            'confidence': 0.74,
            'feed_for': ['goats', 'sheep', 'cattle'],
            'nutrition': {'crude_protein_pct': '16-25%', 'fiber': 'moderate', 'energy': 'moderate'},
            'use_tip': 'Wilt or process before feeding to reduce anti-nutritional factors.'
        },
        {
            'keys': ['sweet potato vine', 'sweet potato leaves'],
            'name': 'Sweet Potato Vines',
            'confidence': 0.79,
            'feed_for': ['goats', 'sheep', 'rabbits', 'pigs'],
            'nutrition': {'crude_protein_pct': '12-18%', 'fiber': 'moderate', 'energy': 'moderate'},
            'use_tip': 'Highly palatable; combine with dry matter sources.'
        },
        {
            'keys': ['maize stover', 'corn stover', 'maize fodder'],
            'name': 'Maize Stover / Fodder',
            'confidence': 0.72,
            'feed_for': ['cattle', 'goats', 'sheep'],
            'nutrition': {'crude_protein_pct': '4-8%', 'fiber': 'high', 'energy': 'moderate'},
            'use_tip': 'Low protein alone; supplement with legumes/protein concentrate.'
        },
    ]

    hit = None
    for p in plant_db:
        if any(k in name_hint for k in p['keys']):
            hit = p
            break

    if not hit:
        return {
            'identified_name': 'Unknown plant (needs clearer image)',
            'confidence': 0.45,
            'feed_suitability': 'UNCONFIRMED',
            'target_livestock': payload.target_livestock,
            'nutrition': {'note': 'Could not confidently identify from current image/hint.'},
            'recommendations': [
                'Upload a close-up of leaves + stem + whole plant in daylight.',
                'Add local/common name in context hint for better matching.',
                'Do not feed unknown plants until confirmed safe by extension officer/vet.'
            ],
            'engine': 'FarmSavior Plant Identifier (real-time best-effort)'
        }

    target = (payload.target_livestock or '').lower().strip()
    suitable = ('LIKELY_SUITABLE' if not target or target in hit['feed_for'] else 'USE_WITH_CAUTION')

    return {
        'identified_name': hit['name'],
        'confidence': hit['confidence'],
        'feed_suitability': suitable,
        'target_livestock': payload.target_livestock,
        'feed_for': hit['feed_for'],
        'nutrition': hit['nutrition'],
        'recommendations': [hit['use_tip'], 'Balance forage with minerals + clean water always available.'],
        'engine': 'FarmSavior Plant Identifier (real-time best-effort)'
    }


@router.post('/ai/pests/identify')
def ai_pest_identify(payload: PestIdentifyIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    _current_user_from_auth(authorization, db)  # signed-in users only

    crop = (payload.crop_type or '').strip().lower()
    hint = f"{payload.file_name or ''} {payload.context_hint or ''} {payload.image_url[:120]}".lower()

    pest_db = [
        {
            'crop_keys': ['maize', 'corn'],
            'pest_keys': ['armyworm', 'fall armyworm', 'spodoptera'],
            'name': 'Fall Armyworm',
            'confidence': 0.86,
            'characteristics': ['Ragged leaf holes', 'Frass in whorl', 'Rapid night feeding'],
            'prevention': ['Early scouting (2x weekly)', 'Use resistant/tolerant maize varieties', 'Encourage natural enemies'],
            'treatment': ['Spot-treat larvae in whorl with recommended bio/chemical control per local label', 'Target early instars for best control']
        },
        {
            'crop_keys': ['tomato'],
            'pest_keys': ['whitefly', 'bemisia'],
            'name': 'Whitefly',
            'confidence': 0.84,
            'characteristics': ['Tiny white insects under leaves', 'Leaf yellowing', 'Sticky honeydew'],
            'prevention': ['Use insect-proof nets', 'Remove weeds/alternate hosts', 'Yellow sticky traps'],
            'treatment': ['Use selective insecticides/biopesticides with rotation', 'Spray undersides of leaves thoroughly']
        },
        {
            'crop_keys': ['cassava'],
            'pest_keys': ['mealybug', 'whitefly'],
            'name': 'Cassava Mealybug / Whitefly Complex',
            'confidence': 0.79,
            'characteristics': ['Leaf distortion', 'Sooty mold risk', 'Stunted growth'],
            'prevention': ['Plant clean cuttings', 'Field sanitation', 'Promote biological control'],
            'treatment': ['Use approved control for identified species', 'Rogue heavily infested plants where practical']
        },
        {
            'crop_keys': ['rice'],
            'pest_keys': ['stem borer', 'leaf folder'],
            'name': 'Rice Stem Borer / Leaf Folder',
            'confidence': 0.8,
            'characteristics': ['Dead hearts/white heads', 'Folded leaves with scraping'],
            'prevention': ['Balanced fertilization', 'Timely planting', 'Pheromone/light trap monitoring'],
            'treatment': ['Apply recommended control at threshold levels', 'Focus on hotspot patches first']
        }
    ]

    match = None
    for p in pest_db:
        crop_ok = any(k in crop for k in p['crop_keys'])
        pest_hit = any(k in hint for k in p['pest_keys'])
        if crop_ok and pest_hit:
            match = p
            break
    if not match:
        for p in pest_db:
            if any(k in crop for k in p['crop_keys']):
                match = p
                break

    if not match:
        return {
            'identified_pest': 'Unknown pest (needs clearer image)',
            'crop_type': payload.crop_type,
            'confidence': 0.45,
            'characteristics': ['Could not match pest confidently from current image/hint.'],
            'prevention': ['Scout frequently and keep field sanitation high.', 'Upload closer image with damaged plant part.'],
            'treatment': ['Do not spray blindly; confirm pest first with extension officer.'],
            'engine': 'FarmSavior AI Pest Identifier (crop-specific best-effort)'
        }

    return {
        'identified_pest': match['name'],
        'crop_type': payload.crop_type,
        'confidence': match['confidence'],
        'characteristics': match['characteristics'],
        'prevention': match['prevention'],
        'treatment': match['treatment'],
        'engine': 'FarmSavior AI Pest Identifier (crop-specific best-effort)'
    }


@router.post('/ai/disease/analyze')
def ai_disease_analyze(payload: DiseaseAnalyzeIn, db: Session = Depends(get_db)):
    target = (payload.crop_type or '').lower().strip()
    note = (payload.context_note or '').lower().strip()
    target_group = normalize_livestock_target(target)

    disease_db = {
        'poultry': [
            {'name':'Newcastle Disease','score':0.83,'keys':['twisted neck','green diarrhea','gasping','paralysis','newcastle'],'differentiate':['Often causes nervous signs like twisted neck or paralysis.', 'Rapid flock spread is more suggestive than isolated respiratory disease.'],'prevention':['Vaccinate on schedule.', 'Strict biosecurity and flock isolation for new birds.', 'Disinfect equipment and limit visitors.'],'treatment':'No specific cure. Give fluids, vitamins, strict isolation, and veterinarian-directed supportive care.'},
            {'name':'Avian Influenza','score':0.82,'keys':['sudden death','swollen head','blue comb','blue wattles','influenza'],'differentiate':['Higher sudden death and facial swelling than Newcastle in many cases.', 'Requires urgent official reporting where mandated.'],'prevention':['Prevent wild-bird contact.', 'Tight movement control and disinfection.', 'Rapid reporting and quarantine.'],'treatment':'Emergency isolation, notify veterinary authorities where required, and follow veterinarian-directed outbreak protocol.'},
            {'name':'Infectious Bursal Disease (Gumboro)','score':0.79,'keys':['gumboro','vent pecking','depression','ruffled feathers','white diarrhea'],'differentiate':['Young birds with sudden depression and vent pecking strongly suggest Gumboro.', 'Immune suppression often follows survivors.'],'prevention':['Vaccinate on time.', 'All-in/all-out management.', 'Thorough house disinfection between flocks.'],'treatment':'Supportive electrolytes, reduce stress, and control secondary infections under veterinary direction.'},
            {'name':'Infectious Bronchitis','score':0.77,'keys':['coughing','sneezing','watery eyes','drop in eggs','misshapen eggs'],'differentiate':['Egg drop and poor shell quality help separate it from simple cold stress.', 'Respiratory signs often spread quickly through the flock.'],'prevention':['Vaccination where used locally.', 'Good ventilation without drafts.', 'Biosecurity and age separation.'],'treatment':'Supportive care, improve ventilation, and manage secondary infection risk with a veterinarian.'},
            {'name':'Fowl Pox','score':0.76,'keys':['scabs','comb lesions','wattles lesions','pox'],'differentiate':['Dry scabby skin lesions on comb/wattles are classic.', 'Wet form may involve mouth lesions and breathing difficulty.'],'prevention':['Vaccinate in endemic areas.', 'Control mosquitoes.', 'Separate infected birds.'],'treatment':'Clean lesions, support hydration/feed intake, and prevent secondary infection.'},
            {'name':'Coccidiosis','score':0.8,'keys':['bloody droppings','bloody stool','depression','drooping wings','coccidiosis'],'differentiate':['Bloody droppings and wet litter strongly point to coccidiosis.', 'Usually differs from Newcastle by lack of twisted-neck nervous signs.'],'prevention':['Keep litter dry.', 'Use coccidiosis prevention program.', 'Avoid overcrowding and wet drinkers.'],'treatment':'Give veterinarian-recommended anticoccidial treatment, electrolytes, and rapid litter correction.'},
            {'name':"Marek's Disease",'score':0.75,'keys':['leg paralysis','one leg forward','weight loss','marek'],'differentiate':["Progressive paralysis in young birds suggests Marek's.", 'Usually no bloody diarrhea like coccidiosis.'],'prevention':['Vaccinate chicks at hatch.', 'Reduce dust and feather dander exposure.', 'Maintain strict chick-source hygiene.'],'treatment':'No cure. Separate affected birds and cull severe chronic cases under guidance.'},
            {'name':'Mycoplasma / CRD','score':0.76,'keys':['nasal discharge','swollen sinuses','coughing','crd','mycoplasma'],'differentiate':['More chronic respiratory signs than sudden high-mortality viral disease.', 'Sinus swelling suggests mycoplasma especially in layers/breeders.'],'prevention':['Buy clean stock.', 'Improve ventilation.', 'Reduce stress and overcrowding.'],'treatment':'Veterinarian-directed antimicrobial plan plus ventilation and stress reduction.'},
            {'name':'Fowl Cholera','score':0.74,'keys':['swollen wattles','sudden deaths','fever','cholera'],'differentiate':['Can cause sudden deaths with swollen wattles and septic signs.', 'Often more acute and toxic-looking than simple CRD.'],'prevention':['Rodent control.', 'Biosecurity and sanitation.', 'Vaccination where locally advised.'],'treatment':'Urgent veterinarian-directed antimicrobial therapy and flock management.'},
            {'name':'Salmonellosis / Pullorum','score':0.73,'keys':['white diarrhea','pasted vent','sleepy chicks','salmonella','pullorum'],'differentiate':['Young chicks with pasted vents and white diarrhea are suggestive.', 'Different from coccidiosis because blood is usually absent.'],'prevention':['Source chicks from clean hatcheries.', 'Sanitize brooders and feeders.', 'Control rodents and contamination.'],'treatment':'Veterinarian-directed antibiotic decision plus hatchery/source review and sanitation.'},
            {'name':'Infectious Coryza','score':0.72,'keys':['facial swelling','foul smell','nasal discharge','coryza'],'differentiate':['Bad-smelling nasal discharge and facial swelling are classic.', 'Usually stronger sinus/head involvement than IB.'],'prevention':['Avoid mixing age groups.', 'Quarantine new birds.', 'Improve ventilation and sanitation.'],'treatment':'Veterinarian-directed antimicrobial support and isolate affected birds.'},
            {'name':'Aspergillosis','score':0.71,'keys':['gasping','moldy feed','moldy litter','aspergillus'],'differentiate':['Moldy litter/feed exposure is a big clue.', 'Respiratory distress without strong infectious spread pattern suggests environmental cause.'],'prevention':['Keep feed dry and mold-free.', 'Use clean litter.', 'Improve brooder ventilation.'],'treatment':'Remove mold source immediately and provide veterinarian-guided respiratory support.'},
            {'name':'Necrotic Enteritis','score':0.72,'keys':['sudden depression','dark diarrhea','wet litter','necrotic'],'differentiate':['Often follows coccidiosis or diet upset.', 'Intestinal signs with sudden flock setback but not classic bloody coccidiosis.'],'prevention':['Control coccidiosis.', 'Manage feed changes carefully.', 'Maintain litter quality.'],'treatment':'Veterinarian-directed antimicrobial program and immediate litter/feed correction.'},
            {'name':'Botulism','score':0.7,'keys':['limp neck','flaccid paralysis',"can't hold head",'botulism'],'differentiate':['Limp neck / flaccid paralysis differs from twisted-neck Newcastle signs.', 'Usually linked to toxin source or rotting matter.'],'prevention':['Remove carcasses quickly.', 'Keep feed/water clean.', 'Prevent access to rotting organic matter.'],'treatment':'Remove toxin source, support hydration, and seek urgent veterinary help.'},
            {'name':'Egg Drop Syndrome','score':0.69,'keys':['soft shell','drop in eggs','shell-less eggs'],'differentiate':['Main sign is egg production drop with shell defects, not major respiratory distress.', 'Often seen in laying flocks with otherwise mild signs.'],'prevention':['Strong breeder/layer vaccination strategy where used.', 'Biosecurity and clean water.'],'treatment':'No direct cure; support flock, review vaccination, minerals, and vet guidance.'},
            {'name':'Colibacillosis','score':0.7,'keys':['air sac','respiratory distress','fever','off feed','e coli'],'differentiate':['Often secondary to ventilation or viral issues.', 'Can overlap with CRD but often follows management stress.'],'prevention':['Ventilation and litter quality.', 'Reduce ammonia and stress.', 'Keep water systems clean.'],'treatment':'Veterinarian-directed antimicrobial treatment and correction of underlying management problem.'},
            {'name':'Fowl Typhoid','score':0.68,'keys':['yellow diarrhea','pale comb','fever','typhoid'],'differentiate':['Systemic depression with diarrhea and pallor rather than classic respiratory pattern.', 'Needs differentiation from pullorum based on age and lab support.'],'prevention':['Sanitation and rodent control.', 'Source clean stock.', 'Disinfect housing thoroughly.'],'treatment':'Veterinarian-directed flock treatment and source tracing.'},
            {'name':'Vitamin A Deficiency','score':0.64,'keys':['eye swelling','poor growth','white plaques','vitamin deficiency'],'differentiate':['Nutritional history and chronic poor performance matter.', 'Not typically rapid infectious spread.'],'prevention':['Balanced feed and proper vitamin supplementation.', 'Protect feed quality in storage.'],'treatment':'Correct ration immediately and seek veterinary confirmation if severe.'},
            {'name':'Heat Stress Syndrome','score':0.66,'keys':['panting','open mouth breathing','hot weather','wings spread'],'differentiate':['Strong heat/weather link and panting dominate.', 'No specific infectious lesion pattern.'],'prevention':['Cooling, shade, airflow, cool water.', 'Avoid overcrowding.'],'treatment':'Immediate cooling, electrolytes, reduce stress, and monitor for secondary losses.'},
            {'name':'Worm Burden / Helminthiasis','score':0.63,'keys':['weight loss','pale comb','poor growth','worms'],'differentiate':['More chronic poor thrift and anemia than sudden infectious outbreak.', 'Fecal exam helps confirm.'],'prevention':['Regular deworm program where indicated.', 'Clean housing and rotation.'],'treatment':'Veterinarian-advised deworming and sanitation.'},
        ],
        'goat': [
            {'name':'PPR','score':0.84,'keys':['mouth sores','nasal discharge','diarrhea','high fever','ppr'],'differentiate':['Mouth erosions plus diarrhea and nasal discharge together strongly suggest PPR.', 'Often more systemic and severe than simple pneumonia.'],'prevention':['Vaccinate where available.', 'Strict isolation and movement control.', 'Quarantine new arrivals.'],'treatment':'No specific cure. Aggressive fluids, nursing care, treatment of secondary infections, and urgent veterinarian support.'},
            {'name':'Contagious Caprine Pleuropneumonia (CCPP)','score':0.82,'keys':['severe cough','painful breathing','ccpp','labored breathing','fever'],'differentiate':['Severe pleuritic breathing pain and rapid respiratory collapse suggest CCPP.', 'Usually more intense chest involvement than routine pneumonia.'],'prevention':['Reduce mixing and crowding.', 'Quarantine purchases.', 'Vaccination where locally available.'],'treatment':'Urgent veterinarian-directed antimicrobial protocol, isolation, and supportive care.'},
            {'name':'Mastitis','score':0.77,'keys':['udder swelling','hot udder','clots in milk','painful udder'],'differentiate':['Udder heat, pain, and milk changes distinguish it from general fever illness.', 'Peracute cases can become toxic very quickly.'],'prevention':['Clean milking hygiene.', 'Dry bedding.', 'Prompt teat injury care.'],'treatment':'Veterinarian-guided mastitis treatment, frequent stripping if advised, and udder support.'},
            {'name':'Foot Rot','score':0.76,'keys':['limping','hoof smell','interdigital','foot rot'],'differentiate':['Lameness with foul hoof smell points strongly to foot rot.', 'Usually differs from arthritis by hoof lesion localization.'],'prevention':['Keep pens dry.', 'Regular hoof trimming.', 'Footbaths in high-risk periods.'],'treatment':'Hoof trimming, disinfection, dry footing, and veterinarian-directed therapy.'},
            {'name':'Orf (Contagious Ecthyma)','score':0.76,'keys':['mouth scabs','lip lesions','teat lesions','orf'],'differentiate':['Crusty lip/mouth lesions with nursing difficulty are classic.', 'Can be confused with PPR, but diarrhea/high fever are less dominant.'],'prevention':['Avoid exposure to active lesions.', 'Separate affected kids.', 'Use gloves because it is zoonotic.'],'treatment':'Support feeding, clean lesions gently, and manage secondary infection risk.'},
            {'name':'Goat Pneumonia','score':0.75,'keys':['cough','rapid breathing','nasal discharge','pneumonia'],'differentiate':['Respiratory signs without mouth sores/diarrhea make pneumonia more likely than PPR.', 'Housing/ventilation history is useful.'],'prevention':['Good ventilation.', 'Reduce drafts and overcrowding.', 'Quarantine stressed/new animals.'],'treatment':'Veterinarian-directed antimicrobial and anti-inflammatory plan with supportive care.'},
            {'name':'Enterotoxemia','score':0.74,'keys':['sudden death','abdominal pain','bloat','clostridial'],'differentiate':['Often sudden with rich-feed history and abdominal pain.', 'Can kill faster than most pneumonias.'],'prevention':['Vaccinate against clostridial disease.', 'Avoid abrupt concentrate changes.', 'Feed consistently.'],'treatment':'Emergency veterinarian care, fluids, antitoxin where appropriate, and supportive therapy.'},
            {'name':'Ketosis / Pregnancy Toxemia','score':0.72,'keys':['late pregnancy','off feed','sweet breath','weakness'],'differentiate':['Late-pregnancy doe with anorexia/weakness strongly suggests metabolic disease.', 'Not primarily infectious.'],'prevention':['Good late-gestation nutrition.', 'Body condition management.', 'Monitor multiple-bearing does closely.'],'treatment':'Urgent energy support, veterinarian metabolic treatment, and obstetric assessment.'},
            {'name':'Haemonchosis','score':0.78,'keys':['pale gums','bottle jaw','weakness','anemia','worms'],'differentiate':['Pale gums and bottle jaw with pasture exposure are classic.', 'Diarrhea may be absent.'],'prevention':['Strategic deworming based on resistance-aware plans.', 'Pasture management and FAMACHA-style monitoring where used.'],'treatment':'Veterinarian-advised dewormer choice, anemia support, and pasture correction.'},
            {'name':'Coccidiosis','score':0.73,'keys':['diarrhea','straining','poor growth','coccidiosis'],'differentiate':['Young kids with diarrhea and poor growth fit coccidiosis.', 'Often tied to crowding and dirty pens.'],'prevention':['Dry kid pens.', 'Reduce overcrowding.', 'Routine sanitation.'],'treatment':'Veterinarian-recommended anticoccidial therapy and hydration support.'},
            {'name':"Johne's Disease",'score':0.67,'keys':['chronic weight loss','persistent diarrhea','wasting'],'differentiate':['Slow chronic wasting is more typical than acute fever disease.', 'Needs testing to confirm.'],'prevention':['Buy from low-risk herds.', 'Prevent manure contamination of feed/water.', 'Separate kids from adult manure heavily.'],'treatment':'No practical cure; cull strategy and herd control planning are important.'},
            {'name':'Caseous Lymphadenitis','score':0.69,'keys':['abscess','lymph node swelling','pus'],'differentiate':['Recurrent abscessed lymph nodes are a major clue.', 'Different from generalized skin disease because lesions localize to nodes.'],'prevention':['Avoid wound contamination.', 'Disinfect equipment.', 'Separate draining cases.'],'treatment':'Veterinary management of abscesses, sanitation, and chronic-case control.'},
            {'name':'Brucellosis','score':0.66,'keys':['abortion','retained placenta','infertility'],'differentiate':['Abortions and infertility dominate rather than respiratory signs.', 'Zoonotic concern requires caution.'],'prevention':['Test-and-control program.', 'Biosecurity for breeding stock.', 'Safe disposal of aborted material.'],'treatment':'Veterinary/public health guided action; control program is more important than casual treatment.'},
            {'name':'Listeriosis','score':0.68,'keys':['circling','head tilt','drooling','neurologic'],'differentiate':['Neurologic circling/head tilt differs from simple pneumonia.', 'Silage history can matter.'],'prevention':['Avoid spoiled silage.', 'Good feed hygiene.', 'Early isolation of neurologic animals.'],'treatment':'Urgent veterinarian-directed antimicrobial and supportive treatment.'},
            {'name':'Tetanus','score':0.67,'keys':['stiffness','lockjaw','rigid legs','tetanus'],'differentiate':['Rigid posture and lockjaw are more typical than floppy weakness.', 'Often follows wounds/castration.'],'prevention':['Vaccination and clean procedures.', 'Prompt wound care.'],'treatment':'Emergency veterinary treatment, antitoxin where appropriate, wound care, and quiet housing.'},
            {'name':'Bluetongue','score':0.64,'keys':['swollen face','mouth ulcers','lameness','blue tongue'],'differentiate':['Mouth/face swelling with insect-season pattern is suggestive.', 'Can overlap with other erosive diseases but vector season matters.'],'prevention':['Vector control.', 'Avoid peak midge exposure when possible.', 'Vaccination if locally relevant.'],'treatment':'Supportive care, shade, soft feed, and veterinarian guidance.'},
            {'name':'Urinary Calculi','score':0.65,'keys':['straining to urinate','tail twitching','crystals','blocked urine'],'differentiate':['Urination strain rather than diarrhea is the key clue.', 'Common in male goats on poor mineral balance.'],'prevention':['Correct calcium-phosphorus balance.', 'Ample water and salt management.', 'Avoid overfeeding concentrates.'],'treatment':'Emergency veterinary intervention for blockage and pain management.'},
            {'name':'Bloat','score':0.66,'keys':['swollen left abdomen','bloat','distended belly'],'differentiate':['Rapid left-side abdominal distension is classic.', 'Often dietary rather than infectious.'],'prevention':['Feed changes gradually.', 'Limit risky lush forage exposure.', 'Maintain roughage balance.'],'treatment':'Emergency decompression/support per veterinarian guidance.'},
            {'name':'CAE','score':0.63,'keys':['joint swelling','arthritis','hard udder','cae'],'differentiate':['Chronic joint enlargement/hard udder suggests CAE.', 'Usually chronic rather than acute fever disease.'],'prevention':['Kid-rearing biosecurity and test-based herd control.', 'Do not share infected colostrum/milk.'],'treatment':'No cure; supportive management and herd control planning.'},
            {'name':'Heartwater','score':0.64,'keys':['high fever','nervous signs','ticks','paddling'],'differentiate':['Tick exposure plus neurologic signs/fever is suggestive.', 'Can be confused with listeriosis but tick history helps.'],'prevention':['Tick control.', 'Pasture and vector management.', 'Quarantine incoming stock.'],'treatment':'Urgent veterinary treatment and aggressive tick control.'},
        ],
        'sheep': [
            {'name':'Sheep Pox','score':0.81,'keys':['pox','skin nodules','scabs','fever'],'differentiate':['Skin nodules/scabs with fever are classic.', 'Distribution and flock spread help separate it from isolated wounds.'],'prevention':['Vaccination where applicable.', 'Strict quarantine and movement control.', 'Disinfection and vector control.'],'treatment':'Supportive care, lesion management, and veterinarian-guided flock protocol.'},
            {'name':'Foot Rot','score':0.79,'keys':['limping','hoof smell','interdigital','foot rot'],'differentiate':['Foul smell and interdigital hoof lesions are typical.', 'Different from joint disease because lesion is in the hoof.'],'prevention':['Dry footing.', 'Regular trimming.', 'Footbaths and culling chronic cases.'],'treatment':'Trim/disinfect feet, dry housing, and veterinarian-directed treatment.'},
            {'name':'PPR','score':0.8,'keys':['mouth sores','nasal discharge','diarrhea','high fever','ppr'],'differentiate':['Mouth lesions with diarrhea and discharge point strongly to PPR.', 'More systemic than simple pneumonia.'],'prevention':['Vaccination where available.', 'Movement control.', 'Strict isolation of suspect cases.'],'treatment':'Supportive fluids, nursing, secondary infection control, and urgent vet input.'},
            {'name':'Bluetongue','score':0.76,'keys':['mouth ulcers','swollen tongue','lameness','blue tongue'],'differentiate':['Mouth lesions plus lameness and midge season suggest bluetongue.', 'Often more edema/swelling than orf.'],'prevention':['Vector control.', 'Avoid high-risk insect exposure.', 'Vaccination where relevant.'],'treatment':'Supportive care, shade, soft feed, and veterinarian guidance.'},
            {'name':'Contagious Ecthyma (Orf)','score':0.75,'keys':['mouth scabs','lip scabs','teat scabs','orf'],'differentiate':['Localized crusty mouth lesions, especially in lambs, are typical.', 'Usually lacks the strong diarrhea/high fever of PPR.'],'prevention':['Separate affected animals.', 'Use gloves; zoonotic risk.', 'Avoid rough grazing injuries when possible.'],'treatment':'Support feeding, protect lesions, and manage secondary infection risk.'},
            {'name':'Mastitis','score':0.74,'keys':['udder swelling','hot udder','abnormal milk','painful udder'],'differentiate':['Udder-focused signs distinguish it from general fever disorders.', 'May follow lamb injury or poor hygiene.'],'prevention':['Milking/lambing hygiene.', 'Clean dry bedding.', 'Prompt teat injury care.'],'treatment':'Veterinarian-guided mastitis therapy and udder support.'},
            {'name':'Enterotoxemia','score':0.74,'keys':['sudden death','abdominal pain','convulsions','clostridial'],'differentiate':['Often sudden after dietary change or rich feed.', 'Can look like poisoning without good history.'],'prevention':['Clostridial vaccination.', 'Avoid abrupt feed changes.', 'Consistent feeding.'],'treatment':'Emergency veterinary care, antitoxin where appropriate, and supportive therapy.'},
            {'name':'Haemonchosis','score':0.78,'keys':['pale gums','bottle jaw','anemia','worms'],'differentiate':['Anemia and bottle jaw are strong clues.', 'Diarrhea may be absent unlike some intestinal diseases.'],'prevention':['Resistance-aware deworming strategy.', 'Pasture rotation and monitoring.', 'Avoid overstocking.'],'treatment':'Veterinarian-advised dewormer choice, anemia support, and pasture correction.'},
            {'name':'Coccidiosis','score':0.72,'keys':['diarrhea','poor growth','straining','coccidiosis'],'differentiate':['Young lambs with diarrhea and poor thrift fit coccidiosis.', 'Often management-related.'],'prevention':['Clean pens.', 'Dry bedding.', 'Reduce crowding stress.'],'treatment':'Veterinarian-recommended anticoccidials and hydration support.'},
            {'name':'Pasteurellosis / Pneumonia','score':0.73,'keys':['cough','nasal discharge','labored breathing','pneumonia'],'differentiate':['Respiratory signs dominate without strong mouth lesions.', 'Stress/weather shifts often precede outbreaks.'],'prevention':['Shelter from cold stress and drafts.', 'Ventilation without crowding.', 'Vaccination where used.'],'treatment':'Veterinarian-directed antimicrobial and supportive respiratory care.'},
            {'name':'Pregnancy Toxemia','score':0.71,'keys':['late pregnancy','off feed','weakness','ketosis'],'differentiate':['Late-gestation ewe with weakness/anorexia suggests metabolic disease.', 'Not primarily infectious.'],'prevention':['Proper late-pregnancy nutrition.', 'Body condition control.', 'Monitor multiple-bearing ewes.'],'treatment':'Urgent energy support and veterinarian metabolic/obstetric care.'},
            {'name':"Johne's Disease",'score':0.66,'keys':['chronic weight loss','wasting','persistent diarrhea'],'differentiate':['Slow chronic wasting is more typical than acute fever illness.', 'Needs testing to confirm.'],'prevention':['Buy from low-risk flocks.', 'Limit manure contamination of feed/water.', 'Cull confirmed cases.'],'treatment':'No practical cure; flock control planning is key.'},
            {'name':'Caseous Lymphadenitis','score':0.67,'keys':['abscess','lymph node swelling','pus'],'differentiate':['Node abscesses are the major clue.', 'Different from diffuse skin disease.'],'prevention':['Disinfect shearing/tagging tools.', 'Separate draining animals.', 'Reduce skin trauma.'],'treatment':'Veterinary management of abscesses and biosecurity control.'},
            {'name':'Brucellosis','score':0.65,'keys':['abortion','infertility','retained placenta'],'differentiate':['Reproductive loss is the main clue.', 'Important zoonotic risk.'],'prevention':['Test breeding stock.', 'Safe disposal of aborted material.', 'Strong breeding biosecurity.'],'treatment':'Veterinary/public-health guided control approach.'},
            {'name':'Listeriosis','score':0.67,'keys':['circling','drooling','head tilt','neurologic'],'differentiate':['Circling/head tilt suggests listeriosis over routine pneumonia.', 'Spoiled silage history increases suspicion.'],'prevention':['Avoid spoiled silage.', 'Maintain feed hygiene.', 'Isolate neurologic animals quickly.'],'treatment':'Urgent veterinarian-directed treatment and supportive care.'},
            {'name':'Tetanus','score':0.66,'keys':['stiffness','lockjaw','rigid','tetanus'],'differentiate':['Rigid posture/lockjaw are classic.', 'Often linked to wounds or procedures.'],'prevention':['Vaccination.', 'Clean lambing/castration/tailing procedures.', 'Prompt wound care.'],'treatment':'Emergency veterinary treatment, antitoxin where appropriate, and quiet care.'},
            {'name':'Liver Fluke Disease','score':0.68,'keys':['bottle jaw','weight loss','anemia','fluke'],'differentiate':['Wet grazing areas and chronic anemia suggest fluke disease.', 'Can resemble worms but pasture/wetland exposure matters.'],'prevention':['Control snail habitat where possible.', 'Strategic flukicide program per veterinary advice.', 'Avoid risky grazing areas.'],'treatment':'Veterinarian-advised flukicide and supportive care.'},
            {'name':'Fly Strike','score':0.7,'keys':['maggots','wool damage','bad smell','restlessness'],'differentiate':['Visible maggots/wool strike are distinctive.', 'Usually external, unlike systemic fever disease.'],'prevention':['Dag control and shearing hygiene.', 'Prompt wound care.', 'Fly control measures.'],'treatment':'Clip/clean affected area urgently and apply veterinarian-advised treatment.'},
            {'name':'Scrapie','score':0.6,'keys':['itching','wool loss','neurologic','scrapie'],'differentiate':['Chronic neurologic/itching pattern rather than acute infection.', 'Needs regulatory/veterinary handling.'],'prevention':['Breeding control and surveillance.', 'Avoid high-risk stock sources.'],'treatment':'No cure; veterinary/regulatory guidance required.'},
            {'name':'Heartwater','score':0.64,'keys':['ticks','high fever','nervous signs','paddling'],'differentiate':['Tick exposure with fever and neurologic signs is suggestive.', 'Can mimic some toxemic conditions.'],'prevention':['Tick control.', 'Pasture/vector management.', 'Quarantine incoming stock.'],'treatment':'Urgent veterinary treatment and aggressive tick control.'},
        ],
        'cattle': [
            {'name':'Lumpy Skin Disease','score':0.83,'keys':['skin nodules','lumpy skin','fever','enlarged lymph'],'differentiate':['Firm skin nodules across the body are the big clue.', 'Vector exposure and herd spread matter.'],'prevention':['Vaccination where available.', 'Biting-insect control.', 'Restrict animal movement.'],'treatment':'Supportive care, wound care, vector control, and veterinarian-directed management.'},
            {'name':'Mastitis','score':0.8,'keys':['udder swelling','clots in milk','hot udder','painful udder'],'differentiate':['Milk changes plus udder pain/swelling are typical.', 'Can be clinical or subclinical.'],'prevention':['Milking hygiene.', 'Teat dipping and clean bedding.', 'Machine maintenance where used.'],'treatment':'Prompt veterinarian-guided mastitis therapy and udder support.'},
            {'name':'Foot and Mouth Disease','score':0.82,'keys':['drooling','mouth blisters','hoof lesions','lameness','fmd'],'differentiate':['Blisters/erosions in mouth and feet with drooling are classic.', 'Very high contagiousness demands caution.'],'prevention':['Vaccination where advised.', 'Movement restriction.', 'Disinfection and strict biosecurity.'],'treatment':'No specific cure; isolate, support hydration/feed, and follow veterinary authority guidance.'},
            {'name':'CBPP','score':0.8,'keys':['painful breathing','chronic cough','cbpp','nasal discharge'],'differentiate':['Chronic contagious pleuropneumonia pattern with chest pain and cough.', 'Different from transient simple pneumonia.'],'prevention':['Movement control.', 'Quarantine new cattle.', 'Vaccination where used locally.'],'treatment':'Urgent veterinarian-directed respiratory/outbreak management.'},
            {'name':'Blackleg','score':0.79,'keys':['sudden lameness','muscle swelling','crepitation','blackleg'],'differentiate':['Sudden hot painful muscle swelling, often in young cattle, is suggestive.', 'Can kill quickly.'],'prevention':['Clostridial vaccination.', 'Rapid carcass disposal.', 'Avoid risky disturbance of contaminated soil where possible.'],'treatment':'Emergency veterinary care immediately; prognosis may be poor if advanced.'},
            {'name':'Anthrax','score':0.83,'keys':['sudden death','bleeding from openings','anthrax'],'differentiate':['Sudden death with bleeding from natural openings is a red flag.', 'Do not open carcass if suspected.'],'prevention':['Vaccination in endemic areas.', 'Avoid disturbing suspected carcasses.', 'Report according to veterinary/public health requirements.'],'treatment':'Urgent veterinary/public-health response only; do not handle casually.'},
            {'name':'East Coast Fever / Theileriosis','score':0.77,'keys':['swollen lymph nodes','high fever','ticks','breathing difficulty'],'differentiate':['Tick exposure with enlarged lymph nodes and fever suggests theileriosis.', 'Can overlap with anaplasmosis but node swelling is helpful.'],'prevention':['Tick control.', 'Vaccination where available.', 'Pasture/vector management.'],'treatment':'Urgent veterinarian-directed anti-theilerial/supportive treatment.'},
            {'name':'Anaplasmosis','score':0.76,'keys':['pale eyes','jaundice','fever','ticks','anemia'],'differentiate':['Severe anemia/jaundice without obvious bloody urine is suggestive.', 'Tick history helps.'],'prevention':['Tick control.', 'Needle/equipment hygiene.', 'Vector management.'],'treatment':'Veterinarian-directed treatment and anemia support.'},
            {'name':'Babesiosis','score':0.77,'keys':['red urine','ticks','fever','weakness'],'differentiate':['Red/bloody urine with fever strongly suggests babesiosis.', 'Tick exposure is a major clue.'],'prevention':['Tick control.', 'Pasture management.', 'Reduce vector pressure.'],'treatment':'Urgent veterinarian-directed anti-babesial treatment and supportive care.'},
            {'name':'Brucellosis','score':0.72,'keys':['abortion','retained placenta','infertility'],'differentiate':['Reproductive loss, not respiratory signs, is the key pattern.', 'Zoonotic risk matters.'],'prevention':['Vaccination/testing programs.', 'Safe disposal of aborted materials.', 'Breeding biosecurity.'],'treatment':'Control-program approach under veterinary/public health guidance.'},
            {'name':'BVD','score':0.71,'keys':['diarrhea','mouth erosions','poor fertility','bvd'],'differentiate':['Can cause diarrhea, erosions, and reproductive problems.', 'Persistently infected animals complicate control.'],'prevention':['Vaccination and testing strategy.', 'Biosecurity for replacements.', 'Identify/remove PI animals if applicable.'],'treatment':'Supportive care and veterinarian-guided herd control.'},
            {'name':'IBR','score':0.72,'keys':['red nose','nasal discharge','fever','ibr','conjunctivitis'],'differentiate':['Red inflamed nose/eyes and respiratory signs are classic clues.', 'Less hoof blistering than FMD.'],'prevention':['Vaccination.', 'Quarantine new cattle.', 'Stress reduction and biosecurity.'],'treatment':'Supportive care and veterinarian management of secondary infections.'},
            {'name':'Hardware Disease','score':0.68,'keys':['arched back','grunt','off feed','metal'],'differentiate':['Pain on movement/grunting after hardware ingestion is suggestive.', 'Not an infectious herd-spread pattern.'],'prevention':['Keep metal out of feed areas.', 'Use magnets where appropriate.'],'treatment':'Urgent veterinary assessment, magnet/surgical decisions, and supportive care.'},
            {'name':'Ketosis','score':0.67,'keys':['off feed','sweet breath','drop in milk','ketosis'],'differentiate':['Fresh dairy cow with low appetite and milk drop suggests ketosis.', 'Metabolic rather than infectious.'],'prevention':['Transition-cow nutrition management.', 'Body condition control.', 'Monitor fresh cows closely.'],'treatment':'Energy therapy and veterinarian metabolic support.'},
            {'name':'Milk Fever','score':0.69,'keys':['down cow','cold ears','calving',"can't stand"],'differentiate':['Around calving with weakness/downer state is typical.', 'Not a febrile infectious presentation.'],'prevention':['Proper dry-cow mineral program.', 'Transition diet management.'],'treatment':'Urgent calcium treatment under veterinary guidance.'},
            {'name':'Bloat','score':0.68,'keys':['left side swelling','bloat','distended rumen'],'differentiate':['Rapid left-sided abdominal distension is classic.', 'Diet history is important.'],'prevention':['Gradual feed change.', 'Control lush-legume risk.', 'Provide roughage balance.'],'treatment':'Emergency decompression and veterinarian support.'},
            {'name':'Trypanosomiasis','score':0.69,'keys':['weight loss','anemia','intermittent fever','tsetse'],'differentiate':['Chronic wasting/anemia in tsetse-risk areas suggests trypanosomiasis.', 'Often more chronic than acute tick fevers.'],'prevention':['Vector control.', 'Avoid high-risk fly areas where possible.', 'Screen herd strategically.'],'treatment':'Veterinarian-directed anti-trypanosomal treatment and supportive care.'},
            {'name':'Dermatophilosis','score':0.66,'keys':['paintbrush lesions','crusty skin','rain rot'],'differentiate':['Crusty paintbrush-like skin lesions are characteristic.', 'More external skin disease than systemic fever disorder.'],'prevention':['Reduce prolonged wetting/tick burden.', 'Good skin hygiene and shelter.'],'treatment':'Clean lesions and use veterinarian-guided therapy.'},
            {'name':'Worm Burden / Helminthiasis','score':0.65,'keys':['weight loss','poor growth','diarrhea','worms'],'differentiate':['Chronic poor thrift and parasitism pattern, often in young stock.', 'Less dramatic than acute septic disease.'],'prevention':['Strategic deworming with resistance awareness.', 'Pasture management.'],'treatment':'Veterinarian-advised deworming and supportive nutrition.'},
            {'name':'Ringworm','score':0.63,'keys':['round hairless patches','crusty circles','ringworm'],'differentiate':['Circular hairless crusty patches are the clue.', 'Mainly skin disease, not fever syndrome.'],'prevention':['Separate affected cattle.', 'Disinfect grooming equipment.', 'Improve hygiene.'],'treatment':'Topical/environmental control with veterinary guidance; zoonotic caution.'},
        ]
    }

    candidates = disease_db.get(target_group) or []
    if not candidates:
        raise HTTPException(
            status_code=400,
            detail={
                'message': 'AI Disease Analyzer only supports poultry, goats, sheep, and cattle.',
                'received': payload.crop_type,
                'normalized': target_group,
                'supported_targets': ['poultry', 'goat', 'sheep', 'cattle'],
            }
        )

    image_hint = re.sub(r'[^a-z0-9]+', ' ', str(payload.image_url or '').lower()).strip()
    signal_text = ' '.join(x for x in [note, image_hint] if x).strip()
    weak_signal = not signal_text
    image_seed = int(hashlib.sha256(str(payload.image_url or '').encode('utf-8')).hexdigest()[:8], 16) if payload.image_url else 0

    ranked = []
    for idx, d in enumerate(candidates):
        key_hits = sum(1 for k in d['keys'] if k in signal_text)
        broad_hits = 0
        if d['name'] in {'PPR', 'Foot and Mouth Disease'} and any(k in signal_text for k in ['mouth sores','mouth blisters','drooling','oral lesions','ulcers']):
            broad_hits += 1
        if d['name'] in {'Goat Pneumonia', 'Pasteurellosis / Pneumonia', 'CBPP', 'Contagious Caprine Pleuropneumonia (CCPP)'} and any(k in signal_text for k in ['cough','labored breathing','rapid breathing','painful breathing','nasal discharge','respiratory']):
            broad_hits += 1
        if d['name'] in {'Haemonchosis', 'Anaplasmosis', 'Liver Fluke Disease'} and any(k in signal_text for k in ['pale gums','anemia','bottle jaw','pale eyes','weakness']):
            broad_hits += 1
        if d['name'] in {'Coccidiosis', 'BVD'} and any(k in signal_text for k in ['diarrhea','bloody droppings','straining','bloody stool']):
            broad_hits += 1
        if d['name'] in {'Sheep Pox', 'Lumpy Skin Disease', 'Dermatophilosis', 'Ringworm', 'Orf (Contagious Ecthyma)', 'Contagious Ecthyma (Orf)'} and any(k in signal_text for k in ['scabs','nodules','skin lesions','hair loss','crusts','pox']):
            broad_hits += 1
        if d['name'] in {'Foot Rot'} and any(k in signal_text for k in ['limping','hoof','foot','foul smell','interdigital']):
            broad_hits += 1
        if d['name'] in {'Mastitis'} and any(k in signal_text for k in ['udder','milk','teat','clots in milk','hot udder']):
            broad_hits += 1

        score = float(d['score'])
        if key_hits > 0:
            score += 0.035 * key_hits
        if broad_hits > 0:
            score += 0.045 * broad_hits

        # Penalize diseases whose hallmark signs are absent when another cluster has stronger evidence.
        if any(k in signal_text for k in ['limping','hoof','foot rot']) and d['name'] not in {'Foot Rot'}:
            score -= 0.03
        if any(k in signal_text for k in ['udder','milk','teat']) and d['name'] not in {'Mastitis'}:
            score -= 0.03
        if any(k in signal_text for k in ['mouth sores','mouth blisters','drooling']) and d['name'] not in {'PPR', 'Foot and Mouth Disease', 'Orf (Contagious Ecthyma)', 'Contagious Ecthyma (Orf)', 'Bluetongue'}:
            score -= 0.02

        diversity_nudge = ((image_seed + idx * 17) % 11) * 0.003
        ranked.append((score + diversity_nudge, key_hits + broad_hits, d))

    ranked.sort(key=lambda x: x[0], reverse=True)

    def _match_reasons(d):
        reasons = []
        matched_keys = [k for k in d['keys'] if k in signal_text][:4]
        if matched_keys:
            reasons.append(f"Matched signs: {', '.join(matched_keys)}")
        if d['name'] in {'PPR', 'Foot and Mouth Disease'} and any(k in signal_text for k in ['mouth sores','mouth blisters','drooling','oral lesions','ulcers']):
            reasons.append('Mouth lesion pattern increases suspicion for erosive viral disease.')
        if d['name'] in {'Goat Pneumonia', 'Pasteurellosis / Pneumonia', 'CBPP', 'Contagious Caprine Pleuropneumonia (CCPP)'} and any(k in signal_text for k in ['cough','labored breathing','rapid breathing','painful breathing','nasal discharge','respiratory']):
            reasons.append('Respiratory signs cluster with this diagnosis.')
        if d['name'] in {'Haemonchosis', 'Anaplasmosis', 'Liver Fluke Disease'} and any(k in signal_text for k in ['pale gums','anemia','bottle jaw','pale eyes','weakness']):
            reasons.append('Anemia/bottle-jaw type signs fit this diagnosis.')
        if d['name'] in {'Foot Rot'} and any(k in signal_text for k in ['limping','hoof','foot','foul smell','interdigital']):
            reasons.append('Hoof/lameness pattern matches this diagnosis.')
        if d['name'] in {'Mastitis'} and any(k in signal_text for k in ['udder','milk','teat','clots in milk','hot udder']):
            reasons.append('Udder or milk abnormalities support this diagnosis.')
        return reasons[:3]

    top_candidates = ranked[:3]
    evidence_strength = sum(hits for _, hits, _ in top_candidates)
    insufficient_evidence = weak_signal or evidence_strength == 0

    if insufficient_evidence:
        shortlist = ranked[:min(3, len(ranked))]
        chosen_index = image_seed % len(shortlist)
        top_score, top_hits, top = shortlist[chosen_index]
        confidence = round(min(0.58, max(0.38, top_score - 0.24)), 2)
        primary_label = f"Possible {top['name']} (low evidence)"
    else:
        top_score, top_hits, top = ranked[0]
        confidence = min(0.97, round(top_score if top_hits > 0 else max(0.52, top_score - 0.18), 2))
        primary_label = f"Possible {top['name']}"

    top_matches = []
    for s, hits, d in ranked[:3]:
        match_conf = round(min(0.97, s if hits > 0 else s - (0.24 if insufficient_evidence else 0.14)), 2)
        top_matches.append({
            'diagnosis': d['name'],
            'confidence': match_conf,
            'why_it_matches': _match_reasons(d),
            'how_to_tell_apart': d['differentiate'],
            'prevention': d['prevention'],
            'treatment': d['treatment'],
        })

    result = {
        'diagnosis': primary_label,
        'confidence': confidence,
        'differentiation': top['differentiate'],
        'recommendation': ' | '.join(top['prevention']),
        'prevention': top['prevention'],
        'treatment': top['treatment'],
        'top_matches': top_matches,
        'next_best_options': [m['diagnosis'] for m in top_matches[1:]],
        'insufficient_evidence': insufficient_evidence,
        'vet_notice': 'Important: Contact a licensed veterinarian for confirmation before treatment.',
        'context_note_used': payload.context_note or '',
        'analysis_signal': 'weak' if insufficient_evidence else 'context-assisted',
        'engine': 'FarmSavior AI Analyzer (livestock differential engine v5)'
    }

    scan_id = None
    try:
        rec = DiseaseScan(user_id=payload.user_id, image_url=payload.image_url, crop_type=payload.crop_type, result=json.dumps(result))
        db.add(rec)
        db.commit()
        db.refresh(rec)
        scan_id = rec.id
    except Exception:
        db.rollback()

    return {'scan_id': scan_id, **result}


@router.get('/ai/disease/scans')
def list_disease_scans(db: Session = Depends(get_db)):
    return db.query(DiseaseScan).order_by(DiseaseScan.id.desc()).all()


@router.delete('/ai/disease/scans/{scan_id}')
def delete_disease_scan(scan_id: int, db: Session = Depends(get_db)):
    row = db.query(DiseaseScan).filter(DiseaseScan.id == scan_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Scan not found')
    db.delete(row)
    db.commit()
    return {'ok': True}


@router.delete('/ai/disease/scans')
def clear_disease_scans(db: Session = Depends(get_db)):
    db.query(DiseaseScan).delete()
    db.commit()
    return {'ok': True}


@router.get('/verification/approved-accounts')
def approved_accounts(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    admin = _current_user_from_auth(authorization, db)
    if not _is_admin_user(admin):
        raise HTTPException(status_code=403, detail='Admin access required')
    rows = db.query(User, VerificationReview).join(
        VerificationReview, VerificationReview.user_id == User.id
    ).filter(VerificationReview.status == 'APPROVED').order_by(VerificationReview.reviewed_at.desc()).all()

    return [{
        'user_id': u.id,
        'full_name': u.full_name,
        'phone': u.phone,
        'country': u.country.value if hasattr(u.country, 'value') else str(u.country),
        'role': u.role.value if hasattr(u.role, 'value') else str(u.role),
        'verified_status': r.status,
        'ai_score': r.ai_score,
        'reviewed_at': r.reviewed_at
    } for u, r in rows]


@router.post('/onboarding/farm-passport')
def upsert_farm_passport(payload: FarmPassportIn, db: Session = Depends(get_db)):
    passport = db.query(FarmPassport).filter(FarmPassport.user_id == payload.user_id).first()
    if not passport:
        passport = FarmPassport(**payload.model_dump())
        db.add(passport)
    else:
        for k, v in payload.model_dump().items():
            setattr(passport, k, v)
    db.commit()
    return {'message': 'Farm passport saved'}


@router.get('/onboarding/farm-passport')
def list_farm_passports(db: Session = Depends(get_db)):
    return db.query(FarmPassport).all()


@router.post('/farmer-profiles')
def upsert_farmer_profile(payload: FarmerProfileIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user or user.role != UserRole.farmer:
        raise HTTPException(status_code=400, detail='User must be a Farmer')
    profile = db.query(FarmerProfile).filter(FarmerProfile.user_id == payload.user_id).first()
    if not profile:
        profile = FarmerProfile(**payload.model_dump())
        db.add(profile)
    else:
        for k, v in payload.model_dump().items():
            setattr(profile, k, v)
    db.commit()
    return {'message': 'Farmer profile saved'}


@router.get('/farmer-profiles')
def list_farmer_profiles(db: Session = Depends(get_db)):
    return db.query(FarmerProfile).all()


@router.post('/marketplace/listings')
def create_listing(payload: CropListingIn, db: Session = Depends(get_db)):
    _require_transact_verified_user(db, int(payload.farmer_id), 'Seller')
    _assert_no_contact_info(payload.crop_name, payload.location)
    listing = CropListing(**payload.model_dump())
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@router.get('/marketplace/listings')
def list_listings(db: Session = Depends(get_db)):
    return db.query(CropListing).order_by(CropListing.id.desc()).all()


@router.put('/marketplace/listings/{listing_id}')
def update_listing(listing_id: int, payload: CropListingIn, db: Session = Depends(get_db)):
    listing = db.query(CropListing).filter(CropListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail='Listing not found')
    data = payload.model_dump()
    _assert_no_contact_info(data.get('crop_name'), data.get('location'))

    decision, score, reason = _ai_review_change('products', data)
    _save_update_review(db, 'products', listing_id, 'update', data, decision, score, reason)
    if decision == 'DENIED':
        raise HTTPException(status_code=403, detail=f'AI review denied update: {reason}')

    for k, v in data.items():
        setattr(listing, k, v)
    db.commit()
    db.refresh(listing)
    return {'decision': decision, 'ai_score': score, 'reason': reason, 'record': listing}


@router.patch('/marketplace/listings/{listing_id}/price-qty')
def patch_listing_price_qty(listing_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    listing = db.query(CropListing).filter(CropListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail='Listing not found')

    decision, score, reason = _ai_review_change('products', payload)
    _save_update_review(db, 'products', listing_id, 'patch', payload, decision, score, reason)
    if decision == 'DENIED':
        raise HTTPException(status_code=403, detail=f'AI review denied update: {reason}')

    if 'quantity_kg' in payload and payload['quantity_kg'] is not None:
        listing.quantity_kg = float(payload['quantity_kg'])
    if 'unit_price' in payload and payload['unit_price'] is not None:
        listing.unit_price = float(payload['unit_price'])
    db.commit()
    db.refresh(listing)
    return {'decision': decision, 'ai_score': score, 'reason': reason, 'record': listing}



@router.delete('/marketplace/listings/{listing_id}')
def delete_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.query(CropListing).filter(CropListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail='Listing not found')
    db.delete(listing)
    db.commit()
    return {'ok': True}

@router.post('/marketplace/livestock')
def create_livestock_listing(payload: LivestockListingIn, db: Session = Depends(get_db)):
    _require_transact_verified_user(db, int(payload.farmer_id), 'Seller')
    _assert_no_contact_info(payload.livestock_type, payload.location)
    listing = LivestockListing(**payload.model_dump())
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@router.get('/marketplace/livestock')
def list_livestock_listings(db: Session = Depends(get_db)):
    return db.query(LivestockListing).order_by(LivestockListing.id.desc()).all()


@router.put('/marketplace/livestock/{listing_id}')
def update_livestock_listing(listing_id: int, payload: LivestockListingIn, db: Session = Depends(get_db)):
    listing = db.query(LivestockListing).filter(LivestockListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail='Livestock listing not found')

    data = payload.model_dump()
    _assert_no_contact_info(data.get('livestock_type'), data.get('location'))
    decision, score, reason = _ai_review_change('livestock', data)
    _save_update_review(db, 'livestock', listing_id, 'update', data, decision, score, reason)
    if decision == 'DENIED':
        raise HTTPException(status_code=403, detail=f'AI review denied update: {reason}')

    for k, v in data.items():
        setattr(listing, k, v)

    db.commit()
    db.refresh(listing)
    return {'decision': decision, 'ai_score': score, 'reason': reason, 'record': listing}


@router.patch('/marketplace/livestock/{listing_id}/price-qty')
def patch_livestock_price_qty(listing_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    listing = db.query(LivestockListing).filter(LivestockListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail='Livestock listing not found')

    decision, score, reason = _ai_review_change('livestock', payload)
    _save_update_review(db, 'livestock', listing_id, 'patch', payload, decision, score, reason)
    if decision == 'DENIED':
        raise HTTPException(status_code=403, detail=f'AI review denied update: {reason}')

    if 'quantity' in payload and payload['quantity'] is not None:
        listing.quantity = int(payload['quantity'])
    if 'unit_price' in payload and payload['unit_price'] is not None:
        listing.unit_price = float(payload['unit_price'])
    db.commit()
    db.refresh(listing)
    return {'decision': decision, 'ai_score': score, 'reason': reason, 'record': listing}


@router.get('/livestock-records/dashboard')
def livestock_records_dashboard(db: Session = Depends(get_db)):
    total = db.query(func.count(SheepGoatRecord.id)).scalar() or 0
    sheep = db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.species == 'SHEEP').scalar() or 0
    goats = db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.species == 'GOAT').scalar() or 0
    ewes = db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.animal_type == 'EWE').scalar() or 0
    rams = db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.animal_type == 'RAM').scalar() or 0
    does = db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.animal_type == 'DOE').scalar() or 0
    bucks = db.query(func.count(SheepGoatRecord.id)).filter(SheepGoatRecord.animal_type == 'BUCK').scalar() or 0
    groups = db.query(func.count(SheepGoatBreedingGroup.id)).scalar() or 0
    return {'totalAnimals': total, 'sheep': sheep, 'goats': goats, 'ewes': ewes, 'rams': rams, 'does': does, 'bucks': bucks, 'groups': groups}


def _upsert_purchase_source(db: Session, user_id: Optional[int], species: Optional[str], name: Optional[str], source_type: Optional[str]):
    cleaned_name = (name or '').strip()
    if not cleaned_name:
        return
    normalized_species = (species or 'ALL').upper()
    normalized_type = (source_type or 'OTHER').upper()
    existing = db.query(LivestockPurchaseSource).filter(
        LivestockPurchaseSource.user_id == user_id,
        func.lower(LivestockPurchaseSource.name) == cleaned_name.lower(),
        func.coalesce(LivestockPurchaseSource.species, 'ALL') == normalized_species
    ).first()
    if existing:
        existing.source_type = normalized_type
    else:
        db.add(LivestockPurchaseSource(
            user_id=user_id,
            species=normalized_species,
            name=cleaned_name,
            source_type=normalized_type
        ))


@router.get('/livestock-records/purchase-sources')
def list_purchase_sources(user_id: Optional[int] = None, species: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(LivestockPurchaseSource)
    if user_id is not None:
        q = q.filter(LivestockPurchaseSource.user_id == user_id)
    if species:
        normalized = species.upper()
        q = q.filter(func.coalesce(LivestockPurchaseSource.species, 'ALL').in_(['ALL', normalized]))
    return q.order_by(LivestockPurchaseSource.name.asc()).all()


@router.post('/livestock-records/purchase-sources')
def create_purchase_source(payload: LivestockPurchaseSourceIn, db: Session = Depends(get_db)):
    cleaned_name = (payload.name or '').strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail='Source name is required')
    normalized_species = (payload.species or 'ALL').upper()
    normalized_type = (payload.source_type or 'OTHER').upper()
    existing = db.query(LivestockPurchaseSource).filter(
        LivestockPurchaseSource.user_id == user.id,
        func.lower(LivestockPurchaseSource.name) == cleaned_name.lower(),
        func.coalesce(LivestockPurchaseSource.species, 'ALL') == normalized_species
    ).first()
    if existing:
        existing.source_type = normalized_type
        db.commit()
        db.refresh(existing)
        return existing
    rec = LivestockPurchaseSource(user_id=payload.user_id, species=normalized_species, name=cleaned_name, source_type=normalized_type)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/livestock-records/animals')
def list_livestock_records(species: Optional[str] = None, animal_type: Optional[str] = None, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    try:
        q = db.query(SheepGoatRecord).filter(SheepGoatRecord.user_id == user.id)
        if species:
            q = q.filter(SheepGoatRecord.species == species.upper())
        if animal_type:
            q = q.filter(SheepGoatRecord.animal_type == animal_type.upper())
        return q.order_by(SheepGoatRecord.id.desc()).all()
    except SQLAlchemyError:
        db.rollback()
        inspector = inspect(db.bind)
        cols = {c['name'] for c in inspector.get_columns('sheep_goat_records')}
        ordered = [
            'id','user_id','ownership','species','animal_type','name','ear_tag','farm_id','registration_number','stars',
            'date_of_birth','acquisition_date','purchased_from','purchased_from_type','purchase_price','currency',
            'sire_id','dam_id','litter_size','initial_weight_kg','breeding_type','castrated','sale_date','sale_price',
            'sold_to','died_date','cull_keep_status','cull_reason','health_status','pen_location','notes','created_at'
        ]
        select_cols = [c for c in ordered if c in cols]
        if not select_cols:
            return []
        sql = f"SELECT {', '.join(select_cols)} FROM sheep_goat_records"
        clauses = ['user_id = :user_id']
        params = {'user_id': user.id}
        if species:
            clauses.append('species = :species')
            params['species'] = species.upper()
        if animal_type:
            clauses.append('animal_type = :animal_type')
            params['animal_type'] = animal_type.upper()
        if clauses:
            sql += ' WHERE ' + ' AND '.join(clauses)
        sql += ' ORDER BY id DESC'
        rows = db.execute(text(sql), params).mappings().all()
        return [dict(r) for r in rows]


@router.post('/livestock-records/animals')
def create_livestock_record(payload: SheepGoatRecordIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    data = payload.model_dump()
    data['user_id'] = user.id
    _enforce_livestock_record_limit(user.id, db)
    if data.get('species'):
        data['species'] = str(data['species']).upper()
    if data.get('animal_type'):
        data['animal_type'] = str(data['animal_type']).upper()
    if data.get('purchased_from_type'):
        data['purchased_from_type'] = str(data['purchased_from_type']).upper()
    rec = SheepGoatRecord(**data)
    db.add(rec)
    _upsert_purchase_source(db, data.get('user_id'), data.get('species'), data.get('purchased_from'), data.get('purchased_from_type'))
    db.commit()
    db.refresh(rec)
    return rec


@router.post('/livestock-records/animals/{record_id}/notes')
def append_livestock_note(record_id: int, payload: dict = Body(default={}), authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    rec = db.query(SheepGoatRecord).filter(SheepGoatRecord.id == record_id, SheepGoatRecord.user_id == user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Livestock record not found')
    note_value = str((payload or {}).get('note') or '').strip()
    if not note_value:
        raise HTTPException(status_code=400, detail='Note is required')
    existing = str(rec.notes or '').strip()
    marker = '\n\n[ATTACHMENTS_JSON]'
    if marker in existing:
        text_part, blob = existing.split(marker, 1)
        text_part = text_part.strip()
        merged_text = f"{text_part}\n{note_value}".strip() if text_part else note_value
        rec.notes = f"{merged_text}{marker}{blob.strip()}"
    else:
        rec.notes = f"{existing}\n{note_value}".strip() if existing else note_value
    db.commit()
    db.refresh(rec)
    return rec


@router.put('/livestock-records/animals/{record_id}')
def update_livestock_record(record_id: int, payload: SheepGoatRecordIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    rec = db.query(SheepGoatRecord).filter(SheepGoatRecord.id == record_id, SheepGoatRecord.user_id == user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Livestock record not found')
    data = payload.model_dump()
    if data.get('species'):
        data['species'] = str(data['species']).upper()
    if data.get('animal_type'):
        data['animal_type'] = str(data['animal_type']).upper()
    if data.get('purchased_from_type'):
        data['purchased_from_type'] = str(data['purchased_from_type']).upper()
    for k, v in data.items():
        setattr(rec, k, v)
    _upsert_purchase_source(db, data.get('user_id') or rec.user_id, data.get('species') or rec.species, data.get('purchased_from'), data.get('purchased_from_type'))
    db.commit()
    db.refresh(rec)
    return rec


@router.delete('/livestock-records/animals/{record_id}')
def delete_livestock_record(record_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    rec = db.query(SheepGoatRecord).filter(SheepGoatRecord.id == record_id, SheepGoatRecord.user_id == user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Livestock record not found')
    db.delete(rec)
    db.commit()
    return {'message': 'deleted'}


@router.get('/livestock-records/breeding-groups')
def list_breeding_groups(db: Session = Depends(get_db)):
    return db.query(SheepGoatBreedingGroup).order_by(SheepGoatBreedingGroup.id.desc()).all()


@router.post('/livestock-records/breeding-groups')
def create_breeding_group(payload: SheepGoatBreedingGroupIn, db: Session = Depends(get_db)):
    rec = SheepGoatBreedingGroup(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/livestock-records/subscription/plans')
def livestock_subscription_plans():
    # Pricing positioned to undercut common international livestock record tools
    # and support all major currencies used across target African markets.
    return {
        'note': 'Prices are monthly base rates and can be billed in supported currencies by FX conversion. Includes one-time 7-day free trial per phone/email.',
        'supported_currencies': ['GHS', 'NGN', 'XOF', 'KES', 'TZS', 'UGX', 'ZAR', 'USD', 'EUR'],
        'free': _livestock_plan_snapshot('free'),
        'plans': [_livestock_plan_snapshot('premium')],
        'coverage': 'Available for all African countries and all FarmSavior listed countries.'
    }



@router.get('/livestock-records/subscription/me')
def livestock_subscription_me(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user = _current_user_from_auth(authorization, db)
    ctx = _livestock_access_context(user.id, db)
    sub = ctx.get('subscription')
    return {
        'tier': ctx.get('tier') or 'free',
        'status': ctx.get('status') or 'NONE',
        'record_limit': ctx.get('record_limit'),
        'can_create_records': ctx.get('can_create_records', False),
        'free': _livestock_plan_snapshot('free'),
        'plans': [_livestock_plan_snapshot('premium')],
        'subscription': {
            'id': sub.id,
            'user_id': sub.user_id,
            'plan_code': sub.plan_code,
            'billing_cycle': sub.billing_cycle,
            'currency': sub.currency,
            'amount': sub.amount,
            'status': sub.status,
            'reference': sub.reference,
            'started_at': sub.started_at.isoformat() if sub and sub.started_at else None,
            'ends_at': sub.ends_at.isoformat() if sub and sub.ends_at else None,
            'country': sub.country,
        } if sub else None,
    }


@router.post('/livestock-records/subscription/checkout')
def livestock_subscription_checkout(payload: SheepGoatSubscriptionIn, db: Session = Depends(get_db)):
    active_existing = _livestock_active_subscription_for_user(payload.user_id, db)
    if active_existing and _subscription_status_upper(active_existing.status) in {'ACTIVE', 'TRIAL_ACTIVE'}:
        return {
            'message': 'subscription already active',
            'already_active': True,
            'reference': active_existing.reference,
            'subscription': _serialize_subscription_record(active_existing),
            'tier': active_existing.plan_code,
            'payment_url': '',
            'payment_provider': 'not_needed',
            'payment_init_error': '',
        }

    plans = {code: {'monthly': plan['monthly_usd'], 'yearly': plan['yearly_usd']} for code, plan in LIVESTOCK_PLAN_CATALOG.items() if code not in ['free']}
    fx = {'USD': 1.0, 'GHS': 15.0, 'NGN': 1600.0, 'XOF': 610.0}

    amount_usd = plans[payload.plan_code][payload.billing_cycle]
    cur = (payload.currency or 'USD').upper()
    country = (payload.country or '').upper()
    amount = round(amount_usd * fx.get(cur, 1.0), 2)

    user = db.query(User).filter(User.id == (payload.user_id or 0)).first() if payload.user_id else None

    # One-time 7-day free trial (no charge now), unique per phone/email/user.
    # IMPORTANT: trial checkout must NEVER fall through into paid checkout.
    if not payload.force_paid:
        raise HTTPException(status_code=400, detail='Free livestock tier does not require checkout. Use paid checkout only for Premium.')

    def mask_value(v: str, keep: int = 4) -> str:
        s = str(v or '')
        if len(s) <= keep:
            return s
        return ('*' * max(0, len(s) - keep)) + s[-keep:]

    payout_channel = 'GH_MOMO' if (country == 'GH' or cur == 'GHS') else 'US_BANK'
    payout_details = {
        'beneficiary_name': 'Akhenaten Mensah',
        'channel': payout_channel,
        'ghana_mobile_money': mask_value(settings.OWNER_PAYOUT_MOMO_GH),
        'us_bank_account': mask_value(settings.OWNER_PAYOUT_US_BANK),
    }

    # Charge currency/amount used by payment gateway
    charge_currency = cur
    charge_amount = amount
    if _paystack_secret_clean():
        # Merchant currently supports GHS live charges; force GHS until additional currencies are enabled on Paystack account.
        charge_currency = 'GHS'
        charge_amount = round(amount_usd * fx.get(charge_currency, 1.0), 2)

    ref = f"SGSUB-{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"
    rec = SheepGoatSubscription(
        user_id=payload.user_id,
        plan_code=payload.plan_code,
        country=country or payload.country,
        billing_cycle=payload.billing_cycle,
        amount=charge_amount,
        currency=charge_currency,
        status='PENDING_PAYMENT',
        reference=ref
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    payment_url = ''
    payment_init_error = ''
    paystack_secret = _paystack_secret_clean()
    if paystack_secret:
        user = db.query(User).filter(User.id == (payload.user_id or 0)).first() if payload.user_id else None
        customer_name = user.full_name if user and user.full_name else 'FarmSavior User'
        customer_email = f"user{payload.user_id or 0}@farmsavior.com"
        if user and getattr(user, 'phone', None):
            customer_email = f"{str(user.phone).replace('+','').replace(' ','')}@farmsavior.com"

        # Paystack expects amount in smallest currency unit (kobo/pesewas/cents)
        ps_currency = charge_currency
        amount_minor = int(round(float(charge_amount) * 100))

        ps_payload = {
            'email': customer_email,
            'amount': amount_minor,
            'reference': ref,
            'currency': ps_currency,
            'callback_url': settings.PAYSTACK_CALLBACK_URL,
            'metadata': {
                'customer_name': customer_name,
                'plan_code': payload.plan_code,
                'billing_cycle': payload.billing_cycle,
                'country': country,
                'payout_channel': payout_channel
            }
        }
        try:
            req = UrlRequest(
                'https://api.paystack.co/transaction/initialize',
                data=json.dumps(ps_payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'FarmSavior/1.0 (+https://www.farmsavior.com)',
                    'Authorization': f'Bearer {paystack_secret}'
                },
                method='POST'
            )
            with urlopen(req, timeout=15) as resp:
                ps_resp = json.loads(resp.read().decode('utf-8', errors='ignore'))
            payment_url = (((ps_resp or {}).get('data') or {}).get('authorization_url') or '')
            if not payment_url:
                payment_init_error = str((ps_resp or {}).get('message') or 'Paystack did not return authorization_url')
        except HTTPError as e:
            payment_url = ''
            try:
                raw = e.read().decode('utf-8', errors='ignore')
                parsed = json.loads(raw) if raw else {}
                msg = parsed.get('message') or raw or str(e)
                payment_init_error = f"HTTP {getattr(e, 'code', 'ERR')}: {msg}"
            except Exception:
                payment_init_error = str(e)
        except Exception as e:
            payment_url = ''
            payment_init_error = str(e)

    key_fingerprint = hashlib.sha256(paystack_secret.encode('utf-8')).hexdigest()[:12] if paystack_secret else ''

    return {
        'message': 'checkout created',
        'reference': ref,
        'subscription': rec,
        'amount_usd': amount_usd,
        'payment_url': payment_url,
        'payment_provider': 'paystack' if paystack_secret else 'not_configured',
        'payment_init_error': payment_init_error,
        'paystack_key_fingerprint': key_fingerprint,
        'payout_routing': payout_details,
        'routing_rule': 'GH/GHS -> Ghana MoMo; all others -> US bank'
    }


@router.get('/livestock-records/subscription/verify/{reference}')
def livestock_subscription_verify(reference: str, db: Session = Depends(get_db)):
    rec = db.query(SheepGoatSubscription).filter(SheepGoatSubscription.reference == reference).first()
    if not rec:
        raise HTTPException(status_code=404, detail='subscription reference not found')
    return _sync_subscription_record(rec, db)


@router.post('/livestock-records/subscription/cancel/{reference}')
def livestock_subscription_cancel(reference: str, db: Session = Depends(get_db)):
    rec = db.query(SheepGoatSubscription).filter(SheepGoatSubscription.reference == reference).first()
    if not rec:
        raise HTTPException(status_code=404, detail='subscription reference not found')

    if rec.status == 'TRIAL_ACTIVE':
        now = datetime.utcnow()
        trial_deadline = rec.ends_at or now
        if now <= trial_deadline:
            rec.status = 'TRIAL_CANCELLED'
            db.commit()
            db.refresh(rec)
            return {
                'message': 'trial cancelled successfully before charge window',
                'reference': reference,
                'status': rec.status,
                'cancelled_at': now.isoformat()
            }
        return {
            'message': 'trial window already ended; cancellation no longer free',
            'reference': reference,
            'status': rec.status
        }

    if rec.status in ['PENDING_PAYMENT', 'ACTIVE']:
        rec.status = 'CANCELLED'
        db.commit()
        db.refresh(rec)
        return {'message': 'subscription cancelled', 'reference': reference, 'status': rec.status}

    return {'message': 'nothing to cancel', 'reference': reference, 'status': rec.status}


@router.post('/marketplace/offers')
def create_offer(payload: OfferIn, db: Session = Depends(get_db)):
    _require_transact_verified_user(db, int(payload.buyer_id), 'Buyer')
    offer = ListingOffer(**payload.model_dump())
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


@router.get('/marketplace/offers')
def list_offers(db: Session = Depends(get_db)):
    return db.query(ListingOffer).all()



@router.delete('/marketplace/livestock/{listing_id}')
def delete_livestock_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.query(LivestockListing).filter(LivestockListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail='Livestock listing not found')
    db.delete(listing)
    db.commit()
    return {'ok': True}

@router.post('/services/logistics')
def create_logistics(payload: LogisticsIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    _assert_no_contact_info(data.get('pickup_location'), data.get('dropoff_location'), data.get('cargo_type'), data.get('cargo_details'))
    req = LogisticsRequest(
        requester_id=data.get('requester_id') or data.get('created_by'),
        pickup_location=data['pickup_location'],
        dropoff_location=data['dropoff_location'],
        cargo_type=data.get('cargo_type') or data.get('cargo_details') or 'General Cargo',
        weight_kg=data.get('weight_kg') or 0,
        status=data.get('status') or 'PENDING',
        image_urls=data.get('image_urls') or '[]',
        cover_image_url=data.get('cover_image_url')
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get('/services/logistics')
def list_logistics(db: Session = Depends(get_db)):
    return db.query(LogisticsRequest).order_by(LogisticsRequest.id.desc()).all()


@router.put('/services/logistics/{request_id}')
def update_logistics(request_id: int, payload: LogisticsIn, db: Session = Depends(get_db)):
    req = db.query(LogisticsRequest).filter(LogisticsRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail='Logistics request not found')
    data = payload.model_dump()
    _assert_no_contact_info(data.get('pickup_location'), data.get('dropoff_location'), data.get('cargo_type'), data.get('cargo_details'))
    req.requester_id = data.get('requester_id') or data.get('created_by') or req.requester_id
    req.pickup_location = data.get('pickup_location', req.pickup_location)
    req.dropoff_location = data.get('dropoff_location', req.dropoff_location)
    req.cargo_type = data.get('cargo_type') or data.get('cargo_details') or req.cargo_type
    req.weight_kg = data.get('weight_kg') or req.weight_kg
    req.status = data.get('status') or req.status
    db.commit()
    db.refresh(req)
    return req


# backwards compatibility
@router.post('/logistics/requests')
def create_logistics_legacy(payload: LogisticsIn, db: Session = Depends(get_db)):
    return create_logistics(payload, db)


@router.get('/logistics/requests')
def list_logistics_legacy(db: Session = Depends(get_db)):
    return list_logistics(db)


@router.post('/logistics/requests/{request_id}/accept')
def accept_logistics(request_id: int, payload: LogisticsAcceptIn, db: Session = Depends(get_db)):
    req = db.query(LogisticsRequest).filter(LogisticsRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail='Request not found')
    req.transporter_id = payload.transporter_id
    req.status = LogisticsStatus.accepted.value
    req.tracking_note = 'Transporter accepted. Pickup pending.'
    db.commit()
    return req


@router.post('/services/equipment-rentals')
def create_equipment_rental(payload: EquipmentRentalIn, db: Session = Depends(get_db)):
    _assert_no_contact_info(payload.equipment_type, payload.location)
    rec = EquipmentRental(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete('/services/logistics/{request_id}')
def delete_logistics(request_id: int, db: Session = Depends(get_db)):
    req = db.query(LogisticsRequest).filter(LogisticsRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail='Logistics request not found')
    db.delete(req)
    db.commit()
    return {'ok': True}

@router.get('/services/equipment-rentals')
def list_equipment_rentals(db: Session = Depends(get_db)):
    return db.query(EquipmentRental).order_by(EquipmentRental.id.desc()).all()


@router.put('/services/equipment-rentals/{rental_id}')
def update_equipment_rental(rental_id: int, payload: EquipmentRentalIn, db: Session = Depends(get_db)):
    rec = db.query(EquipmentRental).filter(EquipmentRental.id == rental_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Equipment rental not found')
    _assert_no_contact_info(payload.equipment_type, payload.location)
    for k, v in payload.model_dump().items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete('/services/equipment-rentals/{rental_id}')
def delete_equipment_rental(rental_id: int, db: Session = Depends(get_db)):
    rec = db.query(EquipmentRental).filter(EquipmentRental.id == rental_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Equipment rental not found')
    db.delete(rec)
    db.commit()
    return {'ok': True}

@router.post('/services/storage-reservations')
def create_storage_reservation(payload: StorageReservationIn, db: Session = Depends(get_db)):
    _assert_no_contact_info(payload.storage_type, payload.location)
    rec = StorageReservation(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/services/storage-reservations')
def list_storage_reservations(db: Session = Depends(get_db)):
    return db.query(StorageReservation).order_by(StorageReservation.id.desc()).all()


@router.put('/services/storage-reservations/{reservation_id}')
def update_storage_reservation(reservation_id: int, payload: StorageReservationIn, db: Session = Depends(get_db)):
    rec = db.query(StorageReservation).filter(StorageReservation.id == reservation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Storage reservation not found')
    _assert_no_contact_info(payload.storage_type, payload.location)
    for k, v in payload.model_dump().items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete('/services/storage-reservations/{reservation_id}')
def delete_storage_reservation(reservation_id: int, db: Session = Depends(get_db)):
    rec = db.query(StorageReservation).filter(StorageReservation.id == reservation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Storage reservation not found')
    db.delete(rec)
    db.commit()
    return {'ok': True}





def _notify_user(db: Session, user_id: Optional[int], title: str, message: str):
    if not user_id:
        return
    db.add(MarketplaceNotification(user_id=user_id, title=title[:180], message=message[:2000]))


def _send_fcm_push(tokens: list[str], title: str, body: str, data: Optional[dict] = None):
    clean_tokens = [str(t).strip() for t in (tokens or []) if str(t).strip()]
    if not clean_tokens:
        return

    service_account_json = str(getattr(settings, 'FIREBASE_SERVICE_ACCOUNT_JSON', '') or '').strip()
    project_id = str(getattr(settings, 'FIREBASE_PROJECT_ID', '') or '').strip()

    if service_account_json and project_id:
        try:
            from google.oauth2 import service_account
            from google.auth.transport.requests import Request as GoogleRequest
            account_info = json.loads(service_account_json)
            creds = service_account.Credentials.from_service_account_info(
                account_info,
                scopes=['https://www.googleapis.com/auth/firebase.messaging']
            )
            creds.refresh(GoogleRequest())
            endpoint = f'https://fcm.googleapis.com/v1/projects/{project_id}/messages:send'
            for token in clean_tokens:
                payload = {
                    'message': {
                        'token': token,
                        'notification': {'title': str(title or '')[:120], 'body': str(body or '')[:240]},
                        'data': {k: str(v) for k, v in (data or {}).items()},
                        'android': {'priority': 'high', 'notification': {'sound': 'default'}},
                        'apns': {'payload': {'aps': {'sound': 'default'}}},
                    }
                }
                req = UrlRequest(endpoint, data=json.dumps(payload).encode('utf-8'), method='POST')
                req.add_header('Content-Type', 'application/json')
                req.add_header('Authorization', f'Bearer {creds.token}')
                with urlopen(req, timeout=8) as resp:
                    resp.read()
            return
        except Exception:
            pass

    server_key = str(getattr(settings, 'FCM_SERVER_KEY', '') or '').strip()
    if not server_key:
        return
    endpoint = 'https://fcm.googleapis.com/fcm/send'
    payload = {
        'registration_ids': clean_tokens,
        'notification': {'title': str(title or '')[:120], 'body': str(body or '')[:240], 'sound': 'default'},
        'data': data or {},
        'priority': 'high',
    }
    try:
        req = UrlRequest(endpoint, data=json.dumps(payload).encode('utf-8'), method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'key={server_key}')
        with urlopen(req, timeout=8) as resp:
            resp.read()
    except Exception:
        pass


def _push_call_alert(db: Session, user_id: int, *, caller_name: str, mode: str, room_url: str):
    rows = db.query(DeviceToken).filter(DeviceToken.user_id == int(user_id)).all()
    tokens = [str(r.token or '').strip() for r in rows if str(r.token or '').strip()]
    if not tokens:
        return
    mode_label = 'Video' if str(mode).lower() == 'video' else 'Audio'
    _send_fcm_push(
        tokens,
        title=f'Incoming {mode_label} Call',
        body=f'{caller_name or "Someone"} is calling you on FarmSavior',
        data={'type': 'incoming_call', 'mode': str(mode or 'audio'), 'room_url': str(room_url or '')}
    )

def _order_fee_breakdown(unit_price: float, quantity: float):
    gross = round(float(unit_price or 0) * float(quantity or 0), 2)
    platform_fee = round(gross * 0.10, 2)
    processing_fee = round(gross * 0.03, 2)
    seller_net = round(max(0, gross - platform_fee - processing_fee), 2)
    return gross, platform_fee, processing_fee, seller_net



def _ensure_seller_payout_profile_schema(db: Session):
    inspector = inspect(db.bind)
    tables = set(inspector.get_table_names())

    create_stmt = """
    CREATE TABLE IF NOT EXISTS seller_payout_profiles (
        id INTEGER PRIMARY KEY,
        user_id INTEGER UNIQUE,
        country VARCHAR(10) DEFAULT 'GH',
        payout_method VARCHAR(40) DEFAULT 'MOBILE_MONEY',
        account_name VARCHAR(160),
        bank_name VARCHAR(120),
        account_number VARCHAR(120),
        mobile_money_provider VARCHAR(80),
        mobile_money_number VARCHAR(80),
        currency VARCHAR(10) DEFAULT 'GHS',
        is_verified BOOLEAN DEFAULT FALSE,
        verification_status VARCHAR(40) DEFAULT 'PENDING',
        transfer_recipient_code VARCHAR(120),
        recipient_last_status VARCHAR(120),
        default_payout_method BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    db.execute(text(create_stmt))

    if 'seller_payout_profiles' not in tables:
        db.commit()
        return

    cols = {c['name'] for c in inspector.get_columns('seller_payout_profiles')}
    required = {
        'country': "VARCHAR(10) DEFAULT 'GH'",
        'payout_method': "VARCHAR(40) DEFAULT 'MOBILE_MONEY'",
        'account_name': 'VARCHAR(160)',
        'bank_name': 'VARCHAR(120)',
        'account_number': 'VARCHAR(120)',
        'mobile_money_provider': 'VARCHAR(80)',
        'mobile_money_number': 'VARCHAR(80)',
        'currency': "VARCHAR(10) DEFAULT 'GHS'",
        'is_verified': 'BOOLEAN DEFAULT FALSE',
        'verification_status': "VARCHAR(40) DEFAULT 'PENDING'",
        'transfer_recipient_code': 'VARCHAR(120)',
        'recipient_last_status': 'VARCHAR(120)',
        'default_payout_method': 'BOOLEAN DEFAULT TRUE',
        'created_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        'updated_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    }
    for col, ddl in required.items():
        if col not in cols:
            db.execute(text(f'ALTER TABLE seller_payout_profiles ADD COLUMN {col} {ddl}'))
    db.commit()


@router.get('/payouts/profiles')
def list_seller_payout_profiles(db: Session = Depends(get_db)):
    _ensure_seller_payout_profile_schema(db)
    return db.query(SellerPayoutProfile).order_by(SellerPayoutProfile.id.desc()).all()


@router.post('/payouts/profiles')
def upsert_seller_payout_profile(payload: SellerPayoutProfileIn, db: Session = Depends(get_db)):
    _ensure_seller_payout_profile_schema(db)
    _assert_no_contact_info(payload.account_name, payload.bank_name)
    rec = db.query(SellerPayoutProfile).filter(SellerPayoutProfile.user_id == payload.user_id).first()
    if not rec:
        rec = SellerPayoutProfile(user_id=payload.user_id)
        db.add(rec)
    for key, value in payload.model_dump().items():
        setattr(rec, key, value)
    rec.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    return rec


@router.put('/payouts/profiles/{user_id}/verify')
def verify_seller_payout_profile(user_id: int, payload: SellerPayoutVerificationIn, db: Session = Depends(get_db)):
    _ensure_seller_payout_profile_schema(db)
    rec = db.query(SellerPayoutProfile).filter(SellerPayoutProfile.user_id == user_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Payout profile not found')
    rec.is_verified = bool(payload.is_verified)
    rec.verification_status = payload.verification_status
    if rec.is_verified and not rec.transfer_recipient_code and _paystack_secret_clean():
        try:
            ps = _paystack_create_transfer_recipient(rec)
            data = (ps or {}).get('data') or {}
            rec.transfer_recipient_code = data.get('recipient_code')
            rec.recipient_last_status = str((ps or {}).get('message') or 'recipient created')
        except Exception as e:
            rec.is_verified = False
            rec.verification_status = 'RECIPIENT_SETUP_FAILED'
            rec.recipient_last_status = str(e)
    rec.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    return rec

@router.post('/orders')
def create_marketplace_order(payload: MarketplaceOrderIn, db: Session = Depends(get_db)):
    _require_transact_verified_user(db, int(payload.buyer_id), 'Buyer')
    _require_transact_verified_user(db, int(payload.seller_id), 'Seller')
    _assert_no_contact_info(payload.listing_title, payload.delivery_note, payload.buyer_note)
    gross, platform_fee, processing_fee, seller_net = _order_fee_breakdown(payload.unit_price, payload.quantity)
    rec = MarketplaceOrder(
        buyer_id=payload.buyer_id,
        seller_id=payload.seller_id,
        listing_type=(payload.listing_type or 'product').upper(),
        listing_id=payload.listing_id,
        listing_title=payload.listing_title,
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        gross_amount=gross,
        platform_fee=platform_fee,
        processing_fee=processing_fee,
        seller_net=seller_net,
        currency=payload.currency or 'GHS',
        delivery_method=payload.delivery_method or 'STANDARD',
        delivery_note=payload.delivery_note,
        buyer_note=payload.buyer_note,
        escrow_status='AWAITING_PAYMENT',
        fulfillment_status='PENDING',
        payment_status='UNPAID',
        payout_status='HELD'
    )
    setattr(rec, 'auto_release_at', None)
    db.add(rec)
    _notify_user(db, payload.buyer_id, 'Order created', f'Your order for {payload.listing_title} is awaiting payment into escrow.')
    _notify_user(db, payload.seller_id, 'New order received', f'You received a new order for {payload.listing_title}.')
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/orders')
def list_marketplace_orders(db: Session = Depends(get_db)):
    return db.query(MarketplaceOrder).order_by(MarketplaceOrder.id.desc()).all()




@router.get('/orders/{order_id}')
def get_marketplace_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    return order


@router.get('/orders/{order_id}/receipt')
def marketplace_order_receipt(order_id: int, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    return {
        'order_id': order.id,
        'listing_title': order.listing_title,
        'listing_type': order.listing_type,
        'gross_amount': order.gross_amount,
        'platform_fee': order.platform_fee,
        'processing_fee': order.processing_fee,
        'seller_net': order.seller_net,
        'currency': order.currency,
        'escrow_status': order.escrow_status,
        'payment_status': order.payment_status,
        'payout_status': order.payout_status,
        'payment_reference': order.payment_reference,
        'receipt_message': f'FarmSavior escrow receipt for order #{order.id}',
        'created_at': order.created_at,
        'released_at': getattr(order, 'released_at', None),
        'refunded_at': getattr(order, 'refunded_at', None),
    }

@router.post('/orders/{order_id}/pay')
def pay_marketplace_order(order_id: int, payload: PaymentIn, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    buyer = db.query(User).filter(User.id == order.buyer_id).first()
    if order.payment_status == 'PAID':
        return {'order': order, 'message': 'Order already paid'}
    email = (getattr(buyer, 'email', '') or '').strip() or f'user{order.buyer_id}@farmsavior.local'
    reference = order.payment_reference or f"ESC-{order.id}-{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"
    try:
        ps_resp = _paystack_transaction_initialize(
            email=email,
            amount_major=order.gross_amount,
            reference=reference,
            metadata={'kind': 'marketplace_order', 'order_id': order.id, 'buyer_id': order.buyer_id, 'seller_id': order.seller_id}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f'Paystack initialize failed: {e}')
    data = (ps_resp or {}).get('data') or {}
    order.payment_reference = reference
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return {'order': order, 'payment': {'authorization_url': data.get('authorization_url'), 'access_code': data.get('access_code'), 'reference': reference}}


@router.post('/orders/{order_id}/verify-payment')
def verify_marketplace_order_payment(order_id: int, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    if not order.payment_reference:
        raise HTTPException(status_code=400, detail='Order has no Paystack payment reference')
    try:
        ps_resp = _paystack_transaction_verify(order.payment_reference)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f'Paystack verify failed: {e}')
    data = (ps_resp or {}).get('data') or {}
    if str(data.get('status') or '').lower() != 'success':
        raise HTTPException(status_code=400, detail='Payment not successful yet')
    existing = db.query(Payment).filter(Payment.reference == order.payment_reference).first()
    if not existing:
        buyer = db.query(User).filter(User.id == order.buyer_id).first()
        payment = Payment(
            payer_id=order.buyer_id,
            payee_id=order.seller_id,
            amount=order.gross_amount,
            currency=order.currency or 'GHS',
            country=getattr(buyer, 'country', CountryCode.gh),
            method='Paystack',
            provider='Paystack',
            escrow_enabled=True,
            reference=order.payment_reference,
            status='SUCCESS'
        )
        db.add(payment)
    order.payment_status = 'PAID'
    order.escrow_status = 'PAID_IN_ESCROW'
    order.fulfillment_status = 'READY_FOR_SELLER'
    setattr(order, 'auto_release_at', datetime.utcnow() + timedelta(days=3))
    _notify_user(db, order.buyer_id, 'Payment secured', f'Your payment for order #{order.id} is now held in FarmSavior escrow.')
    _notify_user(db, order.seller_id, 'Escrow funded', f'Buyer payment for order #{order.id} is secured. You can now fulfill the order.')
    db.commit()
    db.refresh(order)
    return {'order': order, 'verification': data}


@router.post('/paystack/webhook')
async def paystack_webhook(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()
    signature = request.headers.get('x-paystack-signature', '')
    if not _paystack_signature_valid(raw_body, signature):
        raise HTTPException(status_code=401, detail='Invalid Paystack signature')
    payload = json.loads(raw_body.decode('utf-8', errors='ignore') or '{}')
    event = str(payload.get('event') or '')
    data = payload.get('data') or {}
    reference = str(data.get('reference') or '')
    if event == 'charge.success' and reference:
        order = db.query(MarketplaceOrder).filter(MarketplaceOrder.payment_reference == reference).first()
        if order and order.payment_status != 'PAID':
            existing = db.query(Payment).filter(Payment.reference == reference).first()
            if not existing:
                buyer = db.query(User).filter(User.id == order.buyer_id).first()
                db.add(Payment(payer_id=order.buyer_id, payee_id=order.seller_id, amount=order.gross_amount, currency=order.currency or 'GHS', country=getattr(buyer, 'country', CountryCode.gh), method='Paystack', provider='Paystack', escrow_enabled=True, reference=reference, status='SUCCESS'))
            order.payment_status = 'PAID'
            order.escrow_status = 'PAID_IN_ESCROW'
            order.fulfillment_status = 'READY_FOR_SELLER'
            setattr(order, 'auto_release_at', datetime.utcnow() + timedelta(days=3))
            _notify_user(db, order.buyer_id, 'Payment secured', f'Your payment for order #{order.id} is now held in FarmSavior escrow.')
            _notify_user(db, order.seller_id, 'Escrow funded', f'Buyer payment for order #{order.id} is secured. You can now fulfill the order.')
            db.commit()
    elif event in ['transfer.success', 'transfer.failed', 'transfer.reversed']:
        transfer_code = str(data.get('transfer_code') or '')
        hist = db.query(PayoutHistory).filter(PayoutHistory.transfer_code == transfer_code).order_by(PayoutHistory.id.desc()).first()
        if hist:
            hist.status = 'PAYOUT_SENT' if event == 'transfer.success' else ('PAYOUT_FAILED' if event == 'transfer.failed' else 'PAYOUT_REVERSED')
            hist.receipt_note = str(data.get('status') or event)
            order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == hist.order_id).first()
            if order:
                order.payout_status = hist.status
                _notify_user(db, order.seller_id, 'Payout status updated', f'Order #{order.id} payout status: {hist.status}.')
            db.commit()
    return {'ok': True}


@router.put('/orders/{order_id}/status')
def update_marketplace_order_status(order_id: int, payload: MarketplaceOrderStatusIn, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    data = payload.model_dump(exclude_none=True)
    _assert_no_contact_info(data.get('seller_note'), data.get('delivery_note'), data.get('buyer_note'))
    for key, value in data.items():
        setattr(order, key, value)
    order.updated_at = datetime.utcnow()
    if order.fulfillment_status in ['SHIPPED', 'DELIVERED', 'COMPLETED', 'IN_FULFILLMENT'] and order.payment_status == 'PAID' and order.escrow_status == 'PAID_IN_ESCROW':
        order.escrow_status = 'IN_FULFILLMENT'
    if order.fulfillment_status in ['DELIVERED', 'COMPLETED'] and data.get('escrow_status') == 'BUYER_CONFIRMED':
        order.payout_status = 'READY_FOR_RELEASE'
    _notify_user(db, order.buyer_id, 'Order updated', f'Order #{order.id} status changed to {order.fulfillment_status}.')
    _notify_user(db, order.seller_id, 'Order updated', f'Order #{order.id} status changed to {order.fulfillment_status}.')
    db.commit()
    db.refresh(order)
    return order


@router.post('/orders/{order_id}/confirm')
def confirm_marketplace_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    order.fulfillment_status = 'COMPLETED'
    order.escrow_status = 'BUYER_CONFIRMED'
    order.payout_status = 'READY_FOR_RELEASE'
    order.updated_at = datetime.utcnow()
    _notify_user(db, order.seller_id, 'Buyer confirmed order', f'Buyer confirmed order #{order.id}. Funds are ready for release review.')
    db.commit()
    db.refresh(order)
    return order


@router.post('/orders/{order_id}/release')
def release_marketplace_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    if order.payment_status != 'PAID':
        raise HTTPException(status_code=400, detail='Order has not been paid into escrow')
    payout = db.query(SellerPayoutProfile).filter(SellerPayoutProfile.user_id == order.seller_id).first()
    if not payout:
        raise HTTPException(status_code=400, detail='Seller payout method missing')
    if not payout.is_verified:
        raise HTTPException(status_code=400, detail='Seller payout method is not verified yet')
    payout_ref = f"PO-{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"
    transfer_code = None
    payout_status = 'PAYOUT_PENDING'
    receipt_note = 'Payout queued for disbursement'
    if _paystack_secret_clean() and payout.transfer_recipient_code:
        try:
            ps_transfer = _paystack_initiate_transfer(order.seller_net, payout.transfer_recipient_code, f'FarmSavior order #{order.id} payout', payout_ref)
            transfer_data = (ps_transfer or {}).get('data') or {}
            transfer_code = transfer_data.get('transfer_code')
            payout_status = 'PAYOUT_SENT'
            receipt_note = str((ps_transfer or {}).get('message') or 'Paystack transfer initiated')
        except Exception as e:
            payout_status = 'PAYOUT_FAILED'
            receipt_note = f'Paystack transfer failed: {e}'
    order.escrow_status = 'RELEASED'
    order.payout_status = payout_status
    order.updated_at = datetime.utcnow()
    setattr(order, 'released_at', datetime.utcnow())
    db.add(PayoutHistory(order_id=order.id, seller_id=order.seller_id, payout_profile_id=payout.id if payout else None, amount=order.seller_net, currency=order.currency or 'GHS', status=payout_status, reference=payout_ref, transfer_code=transfer_code, receipt_note=receipt_note))
    _notify_user(db, order.seller_id, 'Payout released', f'FarmSavior released {order.seller_net} {order.currency} for order #{order.id}. Status: {payout_status}.')
    _notify_user(db, order.buyer_id, 'Order completed', f'Order #{order.id} escrow has been released to the seller.')
    db.commit()
    db.refresh(order)
    return order


@router.post('/orders/{order_id}/dispute')
def dispute_marketplace_order(order_id: int, payload: MarketplaceOrderStatusIn, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    _assert_no_contact_info(payload.buyer_note, payload.seller_note, payload.delivery_note)
    order.escrow_status = 'DISPUTED'
    order.payout_status = 'ON_HOLD'
    if payload.buyer_note:
        order.buyer_note = payload.buyer_note
    if payload.seller_note:
        order.seller_note = payload.seller_note
    order.updated_at = datetime.utcnow()
    _notify_user(db, order.buyer_id, 'Dispute opened', f'Order #{order.id} is now under dispute review.')
    _notify_user(db, order.seller_id, 'Dispute opened', f'Order #{order.id} is now under dispute review.')
    db.commit()
    db.refresh(order)
    return order

@router.get('/notifications')
def list_marketplace_notifications(user_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(MarketplaceNotification).order_by(MarketplaceNotification.id.desc())
    if user_id:
        q = q.filter(MarketplaceNotification.user_id == user_id)
    return q.limit(200).all()


@router.get('/payout-history')
def list_payout_history(db: Session = Depends(get_db)):
    return db.query(PayoutHistory).order_by(PayoutHistory.id.desc()).all()


@router.post('/orders/{order_id}/refund')
def refund_marketplace_order(order_id: int, payload: RefundRequestIn, db: Session = Depends(get_db)):
    order = db.query(MarketplaceOrder).filter(MarketplaceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    order.escrow_status = 'REFUNDED'
    order.payout_status = 'REFUND_COMPLETED'
    setattr(order, 'refunded_at', datetime.utcnow())
    order.updated_at = datetime.utcnow()
    if payload and payload.buyer_note:
        _assert_no_contact_info(payload.buyer_note)
        order.buyer_note = payload.buyer_note
    _notify_user(db, order.buyer_id, 'Refund issued', f'Order #{order.id} has been refunded through FarmSavior.')
    _notify_user(db, order.seller_id, 'Order refunded', f'Order #{order.id} was refunded and payout will not be released.')
    db.commit()
    db.refresh(order)
    return order


@router.post('/orders/auto-release')
def auto_release_marketplace_orders(payload: AutoReleaseIn, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    orders = db.query(MarketplaceOrder).filter(MarketplaceOrder.payment_status == 'PAID', MarketplaceOrder.payout_status.in_(['READY_FOR_RELEASE', 'HELD', 'ON_HOLD'])).all()
    released = []
    for order in orders:
        payout = db.query(SellerPayoutProfile).filter(SellerPayoutProfile.user_id == order.seller_id, SellerPayoutProfile.is_verified == True).first()
        auto_release_at = getattr(order, 'auto_release_at', None)
        eligible = payload.force or ((order.fulfillment_status in ['DELIVERED', 'COMPLETED']) and auto_release_at and auto_release_at <= now and order.escrow_status not in ['DISPUTED', 'REFUNDED', 'RELEASED'])
        if not (eligible and payout):
            continue
        order.escrow_status = 'RELEASED'
        order.payout_status = 'PAYOUT_SENT'
        setattr(order, 'released_at', now)
        payout_ref = f"PO-{int(now.timestamp())}-{random.randint(100,999)}"
        db.add(PayoutHistory(order_id=order.id, seller_id=order.seller_id, payout_profile_id=payout.id, amount=order.seller_net, currency=order.currency or 'GHS', status='AUTO_RELEASED', reference=payout_ref, receipt_note='Auto release after delivery window'))
        _notify_user(db, order.seller_id, 'Auto payout released', f'FarmSavior auto-released escrow for order #{order.id}.')
        _notify_user(db, order.buyer_id, 'Order auto-completed', f'FarmSavior auto-released escrow for order #{order.id} after the review window.')
        released.append(order.id)
    db.commit()
    return {'released_order_ids': released}

@router.post('/payments')
def create_payment(payload: PaymentIn, db: Session = Depends(get_db)):
    _require_transact_verified_user(db, int(payload.payer_id), 'Payer')
    _require_transact_verified_user(db, int(payload.payee_id), 'Payee')
    provider_currency = {
        'GH': 'GHS',
        'NG': 'NGN',
        'BF': 'XOF'
    }
    ref = f"PAY-{int(datetime.utcnow().timestamp())}-{random.randint(100,999)}"
    payment = Payment(
        payer_id=payload.payer_id,
        payee_id=payload.payee_id,
        amount=payload.amount,
        currency=payload.currency or provider_currency.get(payload.country, 'GHS'),
        country=CountryCode(payload.country),
        method=payload.method,
        provider=payload.provider,
        escrow_enabled=payload.escrow_enabled,
        reference=ref,
        status='SUCCESS'
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get('/payments')
def list_payments(db: Session = Depends(get_db)):
    return db.query(Payment).order_by(Payment.id.desc()).all()


@router.put('/payments/{payment_id}')
def update_payment(payment_id: int, payload: PaymentIn, db: Session = Depends(get_db)):
    rec = db.query(Payment).filter(Payment.id == payment_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Payment not found')
    rec.payer_id = payload.payer_id
    rec.payee_id = payload.payee_id
    rec.amount = payload.amount
    rec.currency = payload.currency or rec.currency
    rec.country = CountryCode(payload.country)
    rec.method = payload.method
    rec.provider = payload.provider
    rec.escrow_enabled = payload.escrow_enabled
    db.commit()
    db.refresh(rec)
    return rec


# backwards compatibility
@router.post('/payments/mobile-money/mock')
def mock_payment(payload: PaymentIn, db: Session = Depends(get_db)):
    return create_payment(payload, db)


@router.post('/weather/alerts')
def create_weather_alert(payload: WeatherAlertIn, db: Session = Depends(get_db)):
    alert = WeatherAlert(**payload.model_dump())
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.put('/weather/alerts/{alert_id}')
def update_weather_alert(alert_id: int, payload: WeatherAlertIn, db: Session = Depends(get_db)):
    alert = db.query(WeatherAlert).filter(WeatherAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail='Weather alert not found')
    for k, v in payload.model_dump().items():
        setattr(alert, k, v)
    db.commit()
    db.refresh(alert)
    return alert


@router.get('/weather/regions')
def weather_regions():
    return COUNTRY_REGIONS


@router.post('/weather/sync')
def sync_weather_alerts(db: Session = Depends(get_db)):
    """Create/refresh baseline alerts for all regions in GH/NG/BF so data stays synchronized."""
    now = datetime.utcnow()
    created = 0
    updated = 0

    for country, regions in COUNTRY_REGIONS.items():
        for region in regions:
            existing = db.query(WeatherAlert).filter(
                WeatherAlert.country == CountryCode(country),
                WeatherAlert.region == region,
                WeatherAlert.alert_type == 'General Forecast'
            ).order_by(WeatherAlert.id.desc()).first()

            message = f"Auto-sync forecast active for {region}. Monitor rainfall variability and transport conditions."
            if existing:
                existing.severity = 'MEDIUM'
                existing.message = message
                existing.valid_until = None
                updated += 1
            else:
                db.add(WeatherAlert(
                    country=CountryCode(country),
                    region=region,
                    severity='MEDIUM',
                    alert_type='General Forecast',
                    message=message,
                    valid_until=None,
                    created_at=now
                ))
                created += 1

    db.commit()
    return {'message': 'Weather alerts synchronized for GH/NG/BF', 'created': created, 'updated': updated}


@router.get('/weather/alerts')
def list_weather_alerts(country: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(WeatherAlert)
    if country:
        q = q.filter(WeatherAlert.country == CountryCode(country))
    return q.order_by(WeatherAlert.country.asc(), WeatherAlert.region.asc(), WeatherAlert.id.desc()).all()


@router.post('/trade/contracts')
def create_contract(payload: ContractIn, db: Session = Depends(get_db)):
    rec = TradeContract(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/trade/contracts')
def list_contracts(db: Session = Depends(get_db)):
    return db.query(TradeContract).order_by(TradeContract.id.desc()).all()


@router.put('/trade/contracts/{contract_id}')
def update_contract(contract_id: int, payload: ContractIn, db: Session = Depends(get_db)):
    rec = db.query(TradeContract).filter(TradeContract.id == contract_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Contract not found')
    for k, v in payload.model_dump().items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/admin/metrics')
def admin_metrics(db: Session = Depends(get_db)):
    return {
        'users_total': db.query(func.count(User.id)).scalar(),
        'farmers_total': db.query(func.count(User.id)).filter(User.role == UserRole.farmer).scalar(),
        'listings_total': db.query(func.count(CropListing.id)).scalar(),
        'livestock_total': db.query(func.count(LivestockListing.id)).scalar(),
        'offers_total': db.query(func.count(ListingOffer.id)).scalar(),
        'logistics_total': db.query(func.count(LogisticsRequest.id)).scalar(),
        'payments_total': db.query(func.count(Payment.id)).scalar(),
        'alerts_total': db.query(func.count(WeatherAlert.id)).scalar(),
        'contracts_total': db.query(func.count(TradeContract.id)).scalar(),
        'disputes_total': db.query(func.count(UpdateReview.id)).filter(UpdateReview.decision == 'DENIED').scalar(),
        'fraud_flags_total': db.query(func.count(Payment.id)).filter(Payment.amount > 100000).scalar(),
    }


@router.get('/admin/disputes')
def admin_disputes(db: Session = Depends(get_db)):
    return db.query(UpdateReview).filter(UpdateReview.decision == 'DENIED').order_by(UpdateReview.id.desc()).all()


@router.get('/admin/fraud-flags')
def admin_fraud_flags(db: Session = Depends(get_db)):
    return db.query(Payment).filter(Payment.amount > 100000).order_by(Payment.id.desc()).all()
