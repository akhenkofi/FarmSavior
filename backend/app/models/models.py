import enum
from datetime import datetime, timedelta
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, Enum
from sqlalchemy.orm import relationship
from app.db.session import Base


class UserRole(str, enum.Enum):
    farmer = 'Farmer'
    buyer = 'Buyer'
    transporter = 'Transporter'
    equipment_provider = 'EquipmentProvider'
    storage_provider = 'StorageProvider'
    admin = 'Admin'


class CountryCode(str, enum.Enum):
    gh = 'GH'
    ng = 'NG'
    bf = 'BF'


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    phone = Column(String(30), unique=True, nullable=False, index=True)
    country = Column(Enum(CountryCode), nullable=False)
    region = Column(String(120), default='Unknown')
    role = Column(Enum(UserRole), nullable=False)
    hashed_password = Column(String(255), nullable=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    farmer_profile = relationship('FarmerProfile', back_populates='user', uselist=False)


class OTPCode(Base):
    __tablename__ = 'otp_codes'
    id = Column(Integer, primary_key=True)
    phone = Column(String(30), index=True)
    code = Column(String(6), nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class IDVerification(Base):
    __tablename__ = 'id_verifications'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True)
    id_type = Column(String(80), nullable=False)
    id_number = Column(String(120), nullable=False)
    id_photo_url = Column(String(500), nullable=False)
    id_front_photo_url = Column(String(500), nullable=True)
    id_back_photo_url = Column(String(500), nullable=True)
    facial_verification_flag = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class VerificationReview(Base):
    __tablename__ = 'verification_reviews'
    id = Column(Integer, primary_key=True)
    id_verification_id = Column(Integer, ForeignKey('id_verifications.id'), unique=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True)
    status = Column(String(20), default='PENDING')  # PENDING | APPROVED | DENIED
    ai_score = Column(Float, default=0)
    ai_reason = Column(Text, default='Awaiting analysis')
    reviewer_note = Column(Text, default='')
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FarmerProfile(Base):
    __tablename__ = 'farmer_profiles'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), unique=True)
    gps_lat = Column(Float, nullable=True)
    gps_lng = Column(Float, nullable=True)
    farm_size_hectares = Column(Float, default=0)
    crops_summary = Column(Text, default='{}')
    livestock_summary = Column(Text, default='{}')
    photo_urls = Column(Text, default='[]')
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', back_populates='farmer_profile')


class FarmPassport(Base):
    __tablename__ = 'farm_passports'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), unique=True)
    gps_lat = Column(Float, nullable=True)
    gps_lng = Column(Float, nullable=True)
    farm_size_hectares = Column(Float, default=0)
    crop_types = Column(Text, default='[]')
    livestock_numbers = Column(Text, default='{}')
    farm_photo_urls = Column(Text, default='[]')
    harvest_records_notes = Column(Text, default='')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ListingStatus(str, enum.Enum):
    open = 'OPEN'
    pending = 'PENDING'
    sold = 'SOLD'


class CropListing(Base):
    __tablename__ = 'crop_listings'
    id = Column(Integer, primary_key=True)
    farmer_id = Column(Integer, ForeignKey('users.id'))
    crop_name = Column(String(120), nullable=False)
    quantity_kg = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    location = Column(String(120), nullable=True)
    country = Column(Enum(CountryCode), default=CountryCode.gh)
    status = Column(Enum(ListingStatus), default=ListingStatus.open)
    created_at = Column(DateTime, default=datetime.utcnow)


class LivestockListing(Base):
    __tablename__ = 'livestock_listings'
    id = Column(Integer, primary_key=True)
    farmer_id = Column(Integer, ForeignKey('users.id'))
    livestock_type = Column(String(120), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    location = Column(String(120), nullable=True)
    country = Column(Enum(CountryCode), default=CountryCode.gh)
    status = Column(String(30), default='OPEN')
    created_at = Column(DateTime, default=datetime.utcnow)


class ListingOffer(Base):
    __tablename__ = 'listing_offers'
    id = Column(Integer, primary_key=True)
    listing_id = Column(Integer, ForeignKey('crop_listings.id'))
    buyer_id = Column(Integer, ForeignKey('users.id'))
    offer_price = Column(Float, nullable=False)
    quantity_kg = Column(Float, nullable=False)
    status = Column(String(30), default='SUBMITTED')
    created_at = Column(DateTime, default=datetime.utcnow)


class LogisticsStatus(str, enum.Enum):
    requested = 'REQUESTED'
    accepted = 'ACCEPTED'
    in_transit = 'IN_TRANSIT'
    delivered = 'DELIVERED'


class LogisticsRequest(Base):
    __tablename__ = 'logistics_requests'
    id = Column(Integer, primary_key=True)
    requester_id = Column(Integer, ForeignKey('users.id'))
    transporter_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    pickup_location = Column(String(255), nullable=False)
    dropoff_location = Column(String(255), nullable=False)
    cargo_type = Column(String(255), nullable=False)
    weight_kg = Column(Float, default=0)
    status = Column(String(30), default='PENDING')
    tracking_note = Column(String(255), default='Awaiting transporter')
    created_at = Column(DateTime, default=datetime.utcnow)


class EquipmentRental(Base):
    __tablename__ = 'equipment_rentals'
    id = Column(Integer, primary_key=True)
    requester_id = Column(Integer, ForeignKey('users.id'))
    equipment_type = Column(String(120), nullable=False)
    duration_days = Column(Integer, nullable=False)
    location = Column(String(120), nullable=False)
    budget = Column(Float, nullable=False)
    status = Column(String(30), default='PENDING')
    created_at = Column(DateTime, default=datetime.utcnow)


class StorageReservation(Base):
    __tablename__ = 'storage_reservations'
    id = Column(Integer, primary_key=True)
    requester_id = Column(Integer, ForeignKey('users.id'))
    storage_type = Column(String(120), nullable=False)
    quantity_kg = Column(Float, nullable=False)
    location = Column(String(120), nullable=False)
    duration_days = Column(Integer, nullable=False)
    status = Column(String(30), default='PENDING')
    created_at = Column(DateTime, default=datetime.utcnow)


class Payment(Base):
    __tablename__ = 'payments'
    id = Column(Integer, primary_key=True)
    payer_id = Column(Integer, ForeignKey('users.id'))
    payee_id = Column(Integer, ForeignKey('users.id'))
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default='GHS')
    country = Column(Enum(CountryCode), default=CountryCode.gh)
    method = Column(String(50), default='MobileMoney')
    provider = Column(String(50), default='MTN')
    escrow_enabled = Column(Boolean, default=True)
    status = Column(String(30), default='PENDING')
    reference = Column(String(120), unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WeatherAlert(Base):
    __tablename__ = 'weather_alerts'
    id = Column(Integer, primary_key=True)
    country = Column(Enum(CountryCode), nullable=False)
    region = Column(String(120), nullable=False)
    severity = Column(String(20), default='MEDIUM')
    alert_type = Column(String(120), nullable=False)
    message = Column(Text, nullable=False)
    valid_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TradeContract(Base):
    __tablename__ = 'trade_contracts'
    id = Column(Integer, primary_key=True)
    origin_country = Column(Enum(CountryCode), nullable=False)
    destination_country = Column(Enum(CountryCode), nullable=False)
    commodity = Column(String(120), nullable=False)
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    delivery_date = Column(DateTime, nullable=False)
    payment_terms = Column(Text, nullable=False)
    status = Column(String(50), default='DRAFT')
    created_at = Column(DateTime, default=datetime.utcnow)


class UpdateReview(Base):
    __tablename__ = 'update_reviews'
    id = Column(Integer, primary_key=True)
    module = Column(String(80), nullable=False)  # products, livestock, etc.
    record_id = Column(Integer, nullable=False)
    action = Column(String(30), nullable=False)  # update, patch
    payload_json = Column(Text, default='{}')
    ai_score = Column(Float, default=0)
    decision = Column(String(20), default='DENIED')  # APPROVED|DENIED
    reason = Column(Text, default='')
    created_at = Column(DateTime, default=datetime.utcnow)


class DeviceToken(Base):
    __tablename__ = 'device_tokens'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    platform = Column(String(20), default='web')
    token = Column(String(500), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class DiseaseScan(Base):
    __tablename__ = 'disease_scans'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    image_url = Column(String(500), nullable=False)
    crop_type = Column(String(120), nullable=True)
    result = Column(Text, default='{}')
    created_at = Column(DateTime, default=datetime.utcnow)


class SheepGoatRecord(Base):
    __tablename__ = 'sheep_goat_records'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    ownership = Column(String(120), nullable=True)
    species = Column(String(20), default='SHEEP')  # SHEEP | GOAT
    animal_type = Column(String(20), nullable=False)  # RAM|EWE|BUCK|DOE
    name = Column(String(120), nullable=True)
    ear_tag = Column(String(120), nullable=True, index=True)
    farm_id = Column(String(120), nullable=True)
    registration_number = Column(String(120), nullable=True)
    stars = Column(Integer, default=0)
    date_of_birth = Column(DateTime, nullable=True)
    acquisition_date = Column(DateTime, nullable=True)
    purchase_price = Column(Float, nullable=True)
    currency = Column(String(10), default='GHS')
    sire_id = Column(String(120), nullable=True)
    dam_id = Column(String(120), nullable=True)
    litter_size = Column(Integer, nullable=True)
    initial_weight_kg = Column(Float, nullable=True)
    breeding_type = Column(String(80), nullable=True)
    castrated = Column(Boolean, default=False)
    sale_date = Column(DateTime, nullable=True)
    sale_price = Column(Float, nullable=True)
    sold_to = Column(String(120), nullable=True)
    died_date = Column(DateTime, nullable=True)
    cull_keep_status = Column(String(20), nullable=True)  # KEEP|CULL
    cull_reason = Column(String(255), nullable=True)
    health_status = Column(String(120), nullable=True)
    pen_location = Column(String(120), nullable=True)
    notes = Column(Text, default='')
    created_at = Column(DateTime, default=datetime.utcnow)


class SheepGoatBreedingGroup(Base):
    __tablename__ = 'sheep_goat_breeding_groups'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    name = Column(String(120), nullable=False)
    species = Column(String(20), nullable=False)
    male_type = Column(String(20), nullable=False)
    female_type = Column(String(20), nullable=False)
    male_count = Column(Integer, default=0)
    female_count = Column(Integer, default=0)
    ratio_label = Column(String(40), nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SheepGoatSubscription(Base):
    __tablename__ = 'sheep_goat_subscriptions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    plan_code = Column(String(40), nullable=False)
    country = Column(String(40), default='GH')
    billing_cycle = Column(String(20), default='monthly')
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False)
    status = Column(String(20), default='ACTIVE')
    reference = Column(String(120), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ends_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorldChatMessage(Base):
    __tablename__ = 'world_chat_messages'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    user_name = Column(String(120), nullable=True)
    user_country = Column(String(10), nullable=True)
    text = Column(Text, nullable=False)
    status = Column(String(20), default='VISIBLE')  # VISIBLE|HIDDEN|BLOCKED
    moderation_label = Column(String(40), nullable=True)  # SAFE|SPAM|ABUSE|SCAM|SEXUAL|VIOLENCE
    moderation_score = Column(Float, default=0)
    moderation_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class WorldChatUserModeration(Base):
    __tablename__ = 'world_chat_user_moderation'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, unique=True, index=True)
    muted_until = Column(DateTime, nullable=True)
    is_banned = Column(Boolean, default=False)
    strike_count = Column(Integer, default=0)
    last_reason = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CommunityProfile(Base):
    __tablename__ = 'community_profiles'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, unique=True, index=True)
    username = Column(String(80), nullable=True, index=True)
    avatar_url = Column(Text, nullable=True)
    cover_image_url = Column(Text, nullable=True)
    bio = Column(Text, default='')
    farm_life = Column(Text, default='')
    interests = Column(String(255), default='farming,gardening')
    visibility = Column(String(20), default='PUBLIC')
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommunityPost(Base):
    __tablename__ = 'community_posts'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    author_name = Column(String(120), nullable=True)
    author_country = Column(String(10), nullable=True)
    text = Column(Text, default='')
    media_url = Column(Text, nullable=True)
    media_type = Column(String(20), default='TEXT')  # TEXT|IMAGE|VIDEO
    tags = Column(String(255), default='')
    status = Column(String(20), default='VISIBLE')  # VISIBLE|HIDDEN
    moderation_label = Column(String(40), nullable=True)
    moderation_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class CommunityPostLike(Base):
    __tablename__ = 'community_post_likes'
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('community_posts.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CommunityPostComment(Base):
    __tablename__ = 'community_post_comments'
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('community_posts.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    author_name = Column(String(120), nullable=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
