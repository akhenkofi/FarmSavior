import random
import json
import hashlib
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
from typing import Optional, Any
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
import xml.etree.ElementTree as ET
import re
import ssl
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Body, Header
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.models import (
    User, OTPCode, FarmerProfile, CropListing, ListingOffer,
    LogisticsRequest, LogisticsStatus, Payment, WeatherAlert,
    UserRole, CountryCode, IDVerification, FarmPassport,
    LivestockListing, EquipmentRental, StorageReservation, TradeContract, VerificationReview, UpdateReview,
    DeviceToken, DiseaseScan, SheepGoatRecord, SheepGoatBreedingGroup, SheepGoatSubscription,
    WorldChatMessage, WorldChatUserModeration,
    CommunityProfile, CommunityPost, CommunityPostLike, CommunityPostComment
)
from app.schemas.schemas import (
    UserCreate, UserLogin, OTPVerify, TokenResponse, FarmerProfileIn,
    CropListingIn, OfferIn, LogisticsIn, LogisticsAcceptIn,
    PaymentIn, WeatherAlertIn, IDVerificationIn, IDVerificationSelfIn, FarmPassportIn,
    LivestockListingIn, EquipmentRentalIn, StorageReservationIn, ContractIn,
    VerificationDecisionIn, DeviceTokenIn, DiseaseAnalyzeIn,
    SheepGoatRecordIn, SheepGoatBreedingGroupIn, SheepGoatSubscriptionIn,
    WorldChatMessageIn, WorldChatModerationActionIn, WorldChatUserSanctionIn,
    CommunityProfileIn, CommunityPostIn, CommunityCommentIn,
    PlantIdentifyIn, PestIdentifyIn, AccountUpdateIn, PasswordChangeIn, DeleteAccountIn
)
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password, decode_access_token
from app.core.data_lake import write_jsonl, write_snapshot

router = APIRouter(prefix='/api/v1')

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
    return bool(v and str(v).startswith('data:image/'))


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


def _ai_review_id_verification(rec: IDVerification):
    score = 0.0
    reasons = []

    if rec.id_number and len(str(rec.id_number).strip()) >= 8:
        score += 0.35
    else:
        reasons.append('ID number too short')

    has_front = _valid_photo_url(getattr(rec, 'id_front_photo_url', None))
    has_back = _valid_photo_url(getattr(rec, 'id_back_photo_url', None))
    has_legacy = _valid_photo_url(getattr(rec, 'id_photo_url', None))

    if has_front and has_back:
        score += 0.45
    elif has_legacy:
        score += 0.20
        reasons.append('Only single ID image provided (front+back required for full approval)')
    else:
        reasons.append('ID photos missing/invalid')

    if rec.facial_verification_flag:
        score += 0.20
    else:
        reasons.append('Facial verification not completed')

    status = 'APPROVED' if score >= 0.75 else 'DENIED'
    reason = 'Auto AI analyzer: ' + ('; '.join(reasons) if reasons else 'All checks passed')
    return status, round(score, 3), reason


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
        'phone': user.phone,
        'email': user.email,
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


def _account_store_recover_user(db: Session, identifier: str) -> Optional[User]:
    ident = (identifier or '').strip().lower()
    if not ident:
        return None
    rows = _account_store_read()
    hit = None
    for r in rows:
        phone = str(r.get('phone') or '').strip().lower()
        email = str(r.get('email') or '').strip().lower()
        if ident in [phone, email]:
            hit = r
            break
    if not hit:
        return None

    if hit.get('is_deleted'):
        return None

    # prevent duplicates if already present under different query path
    existing = db.query(User).filter((User.phone == (hit.get('phone') or '')) | (User.email == (hit.get('email') or ''))).first()
    if existing:
        return existing

    try:
        role_val = str(hit.get('role') or 'Farmer')
        user = User(
            full_name=hit.get('full_name') or 'Recovered User',
            phone=hit.get('phone') or f"TMP-{int(datetime.utcnow().timestamp())}-{random.randint(1000,9999)}",
            email=hit.get('email') or None,
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


def _send_otp(destination: str, method: str, code: str):
    message = f"Your FarmSavior OTP is {code}. It expires soon."
    if method == 'email' and settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS:
        try:
            msg = EmailMessage()
            msg['Subject'] = 'FarmSavior verification code'
            msg['From'] = settings.SMTP_FROM
            msg['To'] = destination
            msg.set_content(message)
            with smtplib.SMTP(settings.SMTP_HOST, int(settings.SMTP_PORT or 587), timeout=12) as smtp:
                smtp.starttls()
                smtp.login(settings.SMTP_USER, settings.SMTP_PASS)
                smtp.send_message(msg)
            return {'sent': True, 'channel': 'email'}
        except Exception as e:
            return {'sent': False, 'channel': 'email', 'error': str(e)}

    if method == 'phone' and settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
            body = urlencode({'To': destination, 'From': settings.TWILIO_FROM_NUMBER, 'Body': message}).encode('utf-8')
            req = Request(url, data=body)
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
    if method == 'phone':
        if not payload.phone:
            raise HTTPException(status_code=400, detail='Phone is required for phone signup')
        exists = db.query(User).filter(User.phone == payload.phone).first()
        if not exists:
            exists = _account_store_recover_user(db, payload.phone)
        if exists:
            raise HTTPException(status_code=400, detail='Phone already registered')
        dest = payload.phone
    elif method == 'email':
        if not payload.email:
            raise HTTPException(status_code=400, detail='Email is required for email signup')
        exists = db.query(User).filter(User.email == payload.email.lower()).first()
        if not exists:
            exists = _account_store_recover_user(db, payload.email.lower())
        if exists:
            raise HTTPException(status_code=400, detail='Email already registered')
        if not payload.phone:
            payload.phone = f"TMP-{int(datetime.utcnow().timestamp())}-{random.randint(1000,9999)}"
        dest = payload.email.lower()
    else:
        raise HTTPException(status_code=400, detail='Unsupported signup method')

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
    db.add(OTPCode(phone=payload.phone, destination=dest, channel=method, code=code))
    db.commit()

    delivery = _send_otp(dest, method, code)
    return {
        'user_id': user.id,
        'otp_sent': delivery.get('sent', False),
        'otp_channel': method,
        'otp_destination': dest,
        'otp_mock_code': code,
        'otp_error': delivery.get('error', ''),
        'message': 'OTP sent'
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

    ident = (payload.identifier or '').strip().lower()
    user = db.query(User).filter((User.phone == ident) | (User.email == ident)).first()
    if not user:
        user = _account_store_recover_user(db, ident)
    if not user or user.is_deleted or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail='Invalid login credentials')
    return TokenResponse(access_token=create_access_token(subject=str(user.id)))


@router.post('/auth/verify-otp', response_model=TokenResponse)
def verify_otp(payload: OTPVerify, db: Session = Depends(get_db)):
    dest = (payload.destination or '').strip().lower()
    otp = db.query(OTPCode).filter((OTPCode.destination == dest) | (OTPCode.phone == payload.destination), OTPCode.is_used == False).order_by(OTPCode.id.desc()).first()
    if not otp:
        raise HTTPException(status_code=404, detail='OTP not found')
    if payload.code not in [otp.code, settings.OTP_BYPASS_CODE]:
        raise HTTPException(status_code=400, detail='Invalid OTP')
    otp.is_used = True
    user = db.query(User).filter((User.phone == otp.phone) | (User.email == otp.destination)).first()
    if user:
        user.is_verified = True
    db.commit()

    return TokenResponse(access_token=create_access_token(subject=str(user.id)))


def _current_user_from_auth(authorization: Optional[str], db: Session):
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Missing bearer token')
    token = authorization.split(' ', 1)[1]
    payload = decode_access_token(token)
    sub = str(payload.get('sub') or '').strip()
    user = None
    if sub.isdigit():
        user = db.query(User).filter(User.id == int(sub)).first()
    if not user:
        user = db.query(User).filter((User.phone == sub) | (User.email == sub.lower())).first()
    if not user or user.is_deleted:
        raise HTTPException(status_code=401, detail='User not found')
    return user


@router.get('/auth/me')
def auth_me(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    return {
        'id': u.id,
        'full_name': u.full_name,
        'phone': u.phone,
        'email': u.email,
        'country': u.country.value if hasattr(u.country, 'value') else str(u.country),
        'region': u.region,
        'role': u.role.value if hasattr(u.role, 'value') else str(u.role)
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
    return {
        'id': u.id,
        'full_name': u.full_name,
        'phone': u.phone,
        'email': u.email,
        'country': u.country.value if hasattr(u.country, 'value') else str(u.country),
        'region': u.region,
        'role': u.role.value if hasattr(u.role, 'value') else str(u.role)
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
def list_users(db: Session = Depends(get_db)):
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
def analytics_users_summary():
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
def create_id_verification(payload: IDVerificationIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get('id_front_photo_url'):
        data['id_front_photo_url'] = data.get('id_photo_url')

    is_ghana_card = str(data.get('id_type') or '') == 'GhanaCard'
    _validate_uploaded_image_input(data.get('id_front_photo_url'), 'id_front_photo_url', required=is_ghana_card)
    _validate_uploaded_image_input(data.get('id_back_photo_url'), 'id_back_photo_url', required=is_ghana_card)
    _validate_uploaded_image_input(data.get('id_photo_url'), 'id_photo_url', required=not is_ghana_card)

    rec = IDVerification(**data)
    db.add(rec)
    db.commit()
    db.refresh(rec)

    review = VerificationReview(
        id_verification_id=rec.id,
        user_id=rec.user_id,
        status='PENDING',
        ai_score=0,
        ai_reason='Awaiting analysis'
    )
    db.add(review)
    db.commit()
    return rec


@router.get('/onboarding/id-verification')
def list_id_verifications(db: Session = Depends(get_db)):
    return db.query(IDVerification).order_by(IDVerification.id.desc()).all()


@router.get('/onboarding/id-verification/me')
def my_latest_id_verification(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    iv = db.query(IDVerification).filter(IDVerification.user_id == u.id).order_by(IDVerification.created_at.desc(), IDVerification.id.desc()).first()
    if not iv:
        return {'application': None, 'review': None}
    review = db.query(VerificationReview).filter(VerificationReview.id_verification_id == iv.id).first()
    return {
        'application': {
            'id': iv.id,
            'id_type': iv.id_type,
            'id_number': iv.id_number,
            'id_photo_url': iv.id_photo_url,
            'id_front_photo_url': iv.id_front_photo_url,
            'id_back_photo_url': iv.id_back_photo_url,
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

    rec = IDVerification(user_id=u.id, **data)
    db.add(rec)
    db.commit()
    db.refresh(rec)

    review = VerificationReview(
        id_verification_id=rec.id,
        user_id=u.id,
        status='PENDING',
        ai_score=0,
        ai_reason='Awaiting analysis'
    )
    db.add(review)
    db.commit()

    return {'message': 'Verification update submitted for re-review', 'id_verification_id': rec.id, 'status': 'PENDING'}


@router.get('/verification/applications')
def list_verification_applications(db: Session = Depends(get_db)):
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
        'facial_verification_flag': iv.facial_verification_flag,
        'status': r.status,
        'ai_score': r.ai_score,
        'ai_reason': r.ai_reason,
        'reviewer_note': r.reviewer_note,
        'reviewed_at': r.reviewed_at
    } for r, iv, u in rows]


@router.post('/verification/analyze/{id_verification_id}')
def analyze_verification(id_verification_id: int, db: Session = Depends(get_db)):
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
def analyze_all_verifications(db: Session = Depends(get_db)):
    all_ids = [x.id for x in db.query(IDVerification).all()]
    approved = 0
    denied = 0
    for vid in all_ids:
        result = analyze_verification(vid, db)
        if result['status'] == 'APPROVED':
            approved += 1
        else:
            denied += 1
    return {'message': 'AI analysis complete', 'total': len(all_ids), 'approved': approved, 'denied': denied}


@router.post('/verification/decision/{id_verification_id}')
def manual_verification_decision(id_verification_id: int, payload: VerificationDecisionIn, db: Session = Depends(get_db)):
    iv = db.query(IDVerification).filter(IDVerification.id == id_verification_id).first()
    if not iv:
        raise HTTPException(status_code=404, detail='Verification application not found')

    review = db.query(VerificationReview).filter(VerificationReview.id_verification_id == id_verification_id).first()
    if not review:
        review = VerificationReview(id_verification_id=iv.id, user_id=iv.user_id)
        db.add(review)

    review.status = payload.status
    review.reviewer_note = payload.reviewer_note or ''
    review.reviewed_at = datetime.utcnow()
    db.commit()
    return {'message': 'Decision saved', 'status': review.status}


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
            req = Request(src['url'], headers={'User-Agent': 'FarmSaviorGovBot/1.0'})
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


@router.get('/weather/public-main')
def public_main_weather():
    rows = []
    for country, cities in MAIN_CITIES.items():
        for city in cities:
            temp = hum = rain = '-'
            cond = 'Data unavailable'

            # Primary: wttr.in
            try:
                req = Request(f'https://wttr.in/{city}?format=j1', headers={'User-Agent': 'FarmSaviorWeather/1.0'})
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
                    req2 = Request(om, headers={'User-Agent': 'FarmSaviorWeather/1.0'})
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
    return rows


@router.get('/news/public')
def public_news(limit: int = 12):
    cache_path = (Path(__file__).resolve().parents[3] / 'data' / 'runtime' / 'public-news-cache.json')
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    items = []
    for source, url in PUBLIC_NEWS_FEEDS:
        try:
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0 FarmSaviorNewsBot/1.0'})
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
    return str(role).lower() == 'admin'


def _world_chat_store_path() -> Path:
    p = (Path(__file__).resolve().parents[3] / 'data' / 'runtime' / 'world-chat.json')
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _world_chat_read() -> list[dict]:
    p = _world_chat_store_path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding='utf-8')) or []
    except Exception:
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
                'text': r.text,
                'status': r.status,
                'moderation_label': r.moderation_label,
                'moderation_reason': r.moderation_reason,
                'created_at': r.created_at.isoformat() if getattr(r, 'created_at', None) else None,
            } for r in reversed(db_rows)]
            _world_chat_write(mirror)
        except Exception:
            pass
        rows = list(reversed(db_rows))
        return [{
            'id': r.id,
            'user_id': r.user_id,
            'user_name': r.user_name,
            'user_country': r.user_country,
            'text': r.text,
            'created_at': r.created_at,
        } for r in rows]

    _world_chat_bootstrap_from_db(db)
    rows = [r for r in _world_chat_read() if str(r.get('status', 'VISIBLE')).upper() == 'VISIBLE']
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
    return p


@router.post('/community/profile/me')
def community_profile_upsert(payload: CommunityProfileIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    p = db.query(CommunityProfile).filter(CommunityProfile.user_id == u.id).first()
    if not p:
        p = CommunityProfile(user_id=u.id)
        db.add(p)
    data = payload.model_dump()
    username = (data.get('username') or '').strip().lower().replace(' ', '')
    if username:
        username = ''.join(ch for ch in username if ch.isalnum() or ch in ['_', '.'])[:30]
        data['username'] = username
    for k, v in data.items():
        setattr(p, k, v)
    if not p.username:
        base = ''.join(ch for ch in (u.full_name or 'farmer').lower() if ch.isalnum())[:14] or 'farmer'
        p.username = f"{base}{u.id}"
    db.commit()
    db.refresh(p)
    return p


@router.get('/community/posts')
def community_posts(limit: int = 60, db: Session = Depends(get_db)):
    n = max(1, min(limit, 200))
    rows = db.query(CommunityPost).filter(CommunityPost.status == 'VISIBLE').order_by(CommunityPost.id.desc()).limit(n).all()
    out = []
    for r in rows:
        likes = db.query(func.count(CommunityPostLike.id)).filter(CommunityPostLike.post_id == r.id).scalar() or 0
        comments = db.query(func.count(CommunityPostComment.id)).filter(CommunityPostComment.post_id == r.id).scalar() or 0
        out.append({
            'id': r.id,
            'user_id': r.user_id,
            'author_name': r.author_name,
            'author_country': r.author_country,
            'text': r.text,
            'media_url': r.media_url,
            'media_type': r.media_type,
            'tags': r.tags,
            'created_at': r.created_at,
            'likes_count': likes,
            'comments_count': comments,
        })
    return out


@router.post('/community/posts')
def community_create_post(payload: CommunityPostIn, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    text = (payload.text or '').strip()
    media_url = (payload.media_url or '').strip() or None
    if not text and not media_url:
        raise HTTPException(status_code=400, detail='Post must include text or media')

    moderation = _moderate_world_chat_text(text or 'safe media post')
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


@router.post('/community/posts/{post_id}/like')
def community_like_post(post_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    u = _current_user_from_auth(authorization, db)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')

    existing = db.query(CommunityPostLike).filter(CommunityPostLike.post_id == post_id, CommunityPostLike.user_id == u.id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {'liked': False}

    rec = CommunityPostLike(post_id=post_id, user_id=u.id)
    db.add(rec)
    db.commit()
    return {'liked': True}


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
        raise HTTPException(status_code=400, detail='Comment blocked by safety filter')

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
            req = Request(
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
    # Rule-based MVP placeholder; can be replaced with TensorFlow/external AI API.
    crop = (payload.crop_type or '').lower()
    img = payload.image_url.lower()
    note = (payload.context_note or '').lower()

    diagnosis = 'Unknown condition'
    confidence = 0.55
    recommendation = 'Collect more images and consult extension officer.'
    treatment = 'Provide supportive care, isolate affected animals/plants where possible, and avoid unverified medication use.'

    if 'cassava' in crop or 'cassava' in img or 'mosaic' in note:
        diagnosis = 'Possible Cassava Mosaic'
        confidence = 0.81
        recommendation = 'Remove severely affected plants and use resistant cuttings.'
        treatment = 'Rogue heavily infected plants, sanitize tools, and apply locally approved mosaic-management protocols.'
    elif 'maize' in crop or 'maize' in img or 'rust' in note or 'yellow spots' in note:
        diagnosis = 'Possible Maize Rust'
        confidence = 0.78
        recommendation = 'Apply appropriate fungicide and improve spacing.'
        treatment = 'Use label-approved fungicide rotation, improve airflow, and remove severely affected leaves.'
    elif 'tomato' in crop or 'tomato' in img or 'blight' in note or 'leaf rot' in note:
        diagnosis = 'Possible Tomato Blight'
        confidence = 0.84
        recommendation = 'Prune affected leaves and use preventive fungicide schedule.'
        treatment = 'Prune and discard infected foliage, avoid overhead watering, and apply preventive fungicide per local guidance.'
    elif any(x in crop for x in ['poultry','chicken']) or 'newcastle' in note:
        diagnosis = 'Possible Newcastle Disease (Poultry)'
        confidence = 0.76
        recommendation = 'Isolate affected birds and review vaccination status immediately.'
        treatment = 'Isolate symptomatic birds, disinfect housing, and start vet-approved treatment/support protocol immediately.'
    elif 'goat' in crop or 'ppr' in note:
        diagnosis = 'Possible PPR (Goat)'
        confidence = 0.74
        recommendation = 'Isolate herd segment and contact vet for confirmation.'
        treatment = 'Immediate isolation, strict movement control, supportive fluids/nutrition, and urgent veterinary treatment plan.'
    elif 'sheep' in crop:
        diagnosis = 'Possible Sheep Pox'
        confidence = 0.72
        recommendation = 'Quarantine and initiate veterinary treatment protocol.'
        treatment = 'Quarantine affected animals, manage lesions, and follow veterinarian-directed pox treatment/prevention protocol.'
    elif 'cattle' in crop:
        diagnosis = 'Possible Lumpy Skin Disease'
        confidence = 0.73
        recommendation = 'Restrict movement and consult livestock officer.'
        treatment = 'Restrict movement immediately, control vectors, and initiate vet-guided treatment/support plan.'
    elif 'rabbit' in crop:
        diagnosis = 'Possible Coccidiosis (Rabbits)'
        confidence = 0.71
        recommendation = 'Improve hygiene, isolate, and provide vet-prescribed treatment.'
        treatment = 'Improve sanitation, isolate affected rabbits, and follow veterinarian-prescribed anti-coccidial protocol.'
    elif 'grasscutter' in crop:
        diagnosis = 'Possible Respiratory Infection (Grasscutter)'
        confidence = 0.68
        recommendation = 'Improve ventilation and isolate symptomatic animals.'
        treatment = 'Improve ventilation urgently, isolate symptomatic stock, and begin vet-directed respiratory treatment protocol.'
    elif 'horse' in crop:
        diagnosis = 'Possible Equine Influenza'
        confidence = 0.69
        recommendation = 'Isolate and monitor temperature, then consult equine vet.'
        treatment = 'Isolate immediately, monitor vitals, provide supportive care, and start equine vet treatment guidance.'
    elif 'dog' in crop:
        diagnosis = 'Possible Canine Distemper'
        confidence = 0.75
        recommendation = 'Immediate isolation and urgent veterinary assessment recommended.'
        treatment = 'Immediate isolation, disinfection of contact areas, and urgent vet-directed treatment plan.'

    vet_notice = 'Important: Contact a licensed veterinarian/agronomist for confirmation before treatment.'
    result = {
        'diagnosis': diagnosis,
        'confidence': confidence,
        'recommendation': recommendation,
        'treatment': treatment,
        'vet_notice': vet_notice,
        'context_note_used': payload.context_note or '',
        'engine': 'FarmSavior AI Analyzer (MVP)'
    }

    rec = DiseaseScan(user_id=payload.user_id, image_url=payload.image_url, crop_type=payload.crop_type, result=json.dumps(result))
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return {'scan_id': rec.id, **result}


@router.get('/ai/disease/scans')
def list_disease_scans(db: Session = Depends(get_db)):
    return db.query(DiseaseScan).order_by(DiseaseScan.id.desc()).all()


@router.get('/verification/approved-accounts')
def approved_accounts(db: Session = Depends(get_db)):
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


@router.post('/marketplace/livestock')
def create_livestock_listing(payload: LivestockListingIn, db: Session = Depends(get_db)):
    _require_transact_verified_user(db, int(payload.farmer_id), 'Seller')
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


@router.get('/livestock-records/animals')
def list_livestock_records(species: Optional[str] = None, animal_type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(SheepGoatRecord)
    if species:
        q = q.filter(SheepGoatRecord.species == species.upper())
    if animal_type:
        q = q.filter(SheepGoatRecord.animal_type == animal_type.upper())
    return q.order_by(SheepGoatRecord.id.desc()).all()


@router.post('/livestock-records/animals')
def create_livestock_record(payload: SheepGoatRecordIn, db: Session = Depends(get_db)):
    rec = SheepGoatRecord(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.put('/livestock-records/animals/{record_id}')
def update_livestock_record(record_id: int, payload: SheepGoatRecordIn, db: Session = Depends(get_db)):
    rec = db.query(SheepGoatRecord).filter(SheepGoatRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Livestock record not found')
    for k, v in payload.model_dump().items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete('/livestock-records/animals/{record_id}')
def delete_livestock_record(record_id: int, db: Session = Depends(get_db)):
    rec = db.query(SheepGoatRecord).filter(SheepGoatRecord.id == record_id).first()
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
        'note': 'Prices are monthly base rates and can be billed in supported currencies by FX conversion.',
        'supported_currencies': ['GHS', 'NGN', 'XOF', 'KES', 'TZS', 'UGX', 'ZAR', 'USD', 'EUR'],
        'plans': [
            {
                'plan_code': 'starter',
                'name': 'Sheep & Goats Starter',
                'monthly_usd': 4.99,
                'yearly_usd': 49.99,
                'features': ['Up to 300 animals', 'Basic records', 'Breeding groups', 'CSV export']
            },
            {
                'plan_code': 'pro',
                'name': 'Sheep & Goats Pro',
                'monthly_usd': 9.99,
                'yearly_usd': 99.99,
                'features': ['Up to 2,500 animals', 'Health and cull tracking', 'Performance analytics', 'Team access (3 users)']
            },
            {
                'plan_code': 'enterprise',
                'name': 'Sheep & Goats Enterprise',
                'monthly_usd': 24.99,
                'yearly_usd': 249.99,
                'features': ['Unlimited animals', 'Multi-farm operations', 'Priority support', 'API/data integrations']
            }
        ],
        'coverage': 'Available for all African countries and all FarmSavior listed countries.'
    }


@router.post('/livestock-records/subscription/checkout')
def livestock_subscription_checkout(payload: SheepGoatSubscriptionIn, db: Session = Depends(get_db)):
    plans = {
        'starter': {'monthly': 4.99, 'yearly': 49.99},
        'pro': {'monthly': 9.99, 'yearly': 99.99},
        'enterprise': {'monthly': 24.99, 'yearly': 249.99}
    }
    fx = {'USD': 1.0, 'GHS': 15.0, 'NGN': 1600.0, 'XOF': 610.0}

    amount_usd = plans[payload.plan_code][payload.billing_cycle]
    cur = (payload.currency or 'USD').upper()
    country = (payload.country or '').upper()
    amount = round(amount_usd * fx.get(cur, 1.0), 2)

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
    if settings.PAYSTACK_SECRET_KEY:
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
    paystack_secret = (settings.PAYSTACK_SECRET_KEY or '').strip()
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
            req = Request(
                'https://api.paystack.co/transaction/initialize',
                data=json.dumps(ps_payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
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

    if rec.status == 'ACTIVE':
        return {'message': 'already active', 'reference': reference, 'status': rec.status}

    paystack_secret = (settings.PAYSTACK_SECRET_KEY or '').strip()
    if not paystack_secret:
        return {'message': 'payment provider not configured', 'reference': reference, 'status': rec.status}

    try:
        req = Request(
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
            db.commit()
            db.refresh(rec)
            return {'message': 'payment verified and subscription activated', 'reference': reference, 'status': rec.status}

        return {'message': 'payment not verified yet', 'reference': reference, 'status': rec.status, 'provider_status': status}
    except Exception as e:
        return {'message': 'verification failed', 'reference': reference, 'status': rec.status, 'error': str(e)}


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


@router.post('/services/logistics')
def create_logistics(payload: LogisticsIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    req = LogisticsRequest(
        requester_id=data.get('requester_id') or data.get('created_by'),
        pickup_location=data['pickup_location'],
        dropoff_location=data['dropoff_location'],
        cargo_type=data.get('cargo_type') or data.get('cargo_details') or 'General Cargo',
        weight_kg=data.get('weight_kg') or 0,
        status=data.get('status') or 'PENDING'
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
    rec = EquipmentRental(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get('/services/equipment-rentals')
def list_equipment_rentals(db: Session = Depends(get_db)):
    return db.query(EquipmentRental).order_by(EquipmentRental.id.desc()).all()


@router.put('/services/equipment-rentals/{rental_id}')
def update_equipment_rental(rental_id: int, payload: EquipmentRentalIn, db: Session = Depends(get_db)):
    rec = db.query(EquipmentRental).filter(EquipmentRental.id == rental_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Equipment rental not found')
    for k, v in payload.model_dump().items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


@router.post('/services/storage-reservations')
def create_storage_reservation(payload: StorageReservationIn, db: Session = Depends(get_db)):
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
    for k, v in payload.model_dump().items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return rec


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
