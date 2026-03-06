from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel


Country = Literal['GH', 'NG', 'BF']
UserType = Literal['Farmer', 'Buyer', 'Transporter', 'EquipmentProvider', 'StorageProvider']


class UserCreate(BaseModel):
    full_name: str
    phone: str
    country: Country
    region: str
    user_type: UserType
    password: Optional[str] = None


class UserLogin(BaseModel):
    phone: str
    password: str


class OTPVerify(BaseModel):
    phone: str
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class IDVerificationIn(BaseModel):
    user_id: int
    id_type: Literal['GhanaCard', 'NIN', 'BF National ID']
    id_number: str
    id_photo_url: str
    id_front_photo_url: Optional[str] = None
    id_back_photo_url: Optional[str] = None
    facial_verification_flag: bool = False


class VerificationDecisionIn(BaseModel):
    status: Literal['APPROVED', 'DENIED']
    reviewer_note: Optional[str] = None


class FarmPassportIn(BaseModel):
    user_id: int
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    farm_size_hectares: float = 0
    crop_types: str = '[]'
    livestock_numbers: str = '{}'
    farm_photo_urls: str = '[]'
    harvest_records_notes: str = ''


class FarmerProfileIn(BaseModel):
    user_id: int
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    farm_size_hectares: float = 0
    crops_summary: str = '{}'
    livestock_summary: str = '{}'
    photo_urls: str = '[]'


class CropListingIn(BaseModel):
    farmer_id: int
    crop_name: str
    quantity_kg: float
    unit_price: float
    location: Optional[str] = None
    country: Country = 'GH'
    status: str = 'OPEN'


class LivestockListingIn(BaseModel):
    farmer_id: int
    livestock_type: str
    quantity: int
    unit_price: float
    location: Optional[str] = None
    country: Country = 'GH'
    status: str = 'OPEN'


class LogisticsIn(BaseModel):
    requester_id: Optional[int] = None
    created_by: Optional[int] = None
    pickup_location: str
    dropoff_location: str
    cargo_type: Optional[str] = None
    cargo_details: Optional[str] = None
    weight_kg: float = 0
    status: str = 'PENDING'


class EquipmentRentalIn(BaseModel):
    requester_id: int
    equipment_type: str
    duration_days: int
    location: str
    budget: float
    status: str = 'PENDING'


class StorageReservationIn(BaseModel):
    requester_id: int
    storage_type: str
    quantity_kg: float
    location: str
    duration_days: int
    status: str = 'PENDING'


class OfferIn(BaseModel):
    listing_id: int
    buyer_id: int
    offer_price: float
    quantity_kg: float


class LogisticsAcceptIn(BaseModel):
    transporter_id: int


class PaymentIn(BaseModel):
    payer_id: int
    payee_id: int
    amount: float
    country: Country
    method: str
    provider: str
    escrow_enabled: bool = True
    currency: Optional[str] = None


class WeatherAlertIn(BaseModel):
    country: Country
    region: str
    severity: str = 'MEDIUM'
    alert_type: str
    message: str
    valid_until: Optional[datetime] = None


class ContractIn(BaseModel):
    origin_country: Country
    destination_country: Country
    commodity: str
    quantity: float
    price: float
    delivery_date: datetime
    payment_terms: str
    status: str = 'DRAFT'


class DeviceTokenIn(BaseModel):
    user_id: Optional[int] = None
    platform: str = 'web'
    token: str


class DiseaseAnalyzeIn(BaseModel):
    user_id: Optional[int] = None
    image_url: str
    crop_type: Optional[str] = None


class SheepGoatRecordIn(BaseModel):
    user_id: Optional[int] = None
    ownership: Optional[str] = None
    species: Literal['SHEEP', 'GOAT'] = 'SHEEP'
    animal_type: Literal['RAM', 'EWE', 'BUCK', 'DOE']
    name: Optional[str] = None
    ear_tag: Optional[str] = None
    farm_id: Optional[str] = None
    registration_number: Optional[str] = None
    stars: int = 0
    date_of_birth: Optional[datetime] = None
    acquisition_date: Optional[datetime] = None
    purchase_price: Optional[float] = None
    currency: str = 'GHS'
    sire_id: Optional[str] = None
    dam_id: Optional[str] = None
    litter_size: Optional[int] = None
    initial_weight_kg: Optional[float] = None
    breeding_type: Optional[str] = None
    castrated: bool = False
    sale_date: Optional[datetime] = None
    sale_price: Optional[float] = None
    sold_to: Optional[str] = None
    died_date: Optional[datetime] = None
    cull_keep_status: Optional[str] = None
    cull_reason: Optional[str] = None
    health_status: Optional[str] = None
    pen_location: Optional[str] = None
    notes: Optional[str] = ''


class SheepGoatBreedingGroupIn(BaseModel):
    user_id: Optional[int] = None
    name: str
    species: Literal['SHEEP', 'GOAT']
    male_type: Literal['RAM', 'BUCK']
    female_type: Literal['EWE', 'DOE']
    male_count: int = 0
    female_count: int = 0
    ratio_label: Optional[str] = None
    active: bool = True


class SheepGoatSubscriptionIn(BaseModel):
    user_id: Optional[int] = None
    plan_code: Literal['starter', 'pro', 'enterprise']
    country: str = 'GH'
    billing_cycle: Literal['monthly', 'yearly'] = 'monthly'
    currency: str


class WorldChatMessageIn(BaseModel):
    text: str


class WorldChatModerationActionIn(BaseModel):
    message_id: int
    action: Literal['approve', 'hide', 'delete'] = 'approve'
    reason: Optional[str] = None


class WorldChatUserSanctionIn(BaseModel):
    mute_minutes: int = 0
    ban: bool = False
    reason: Optional[str] = None


class CommunityProfileIn(BaseModel):
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    bio: Optional[str] = ''
    farm_life: Optional[str] = ''
    interests: Optional[str] = 'farming,gardening'
    visibility: Optional[Literal['PUBLIC', 'FOLLOWERS']] = 'PUBLIC'


class CommunityPostIn(BaseModel):
    text: Optional[str] = ''
    media_url: Optional[str] = None
    media_type: Optional[Literal['TEXT', 'IMAGE', 'VIDEO']] = 'TEXT'
    tags: Optional[str] = ''


class CommunityCommentIn(BaseModel):
    text: str


class PlantIdentifyIn(BaseModel):
    user_id: Optional[int] = None
    image_url: str
    file_name: Optional[str] = None
    context_hint: Optional[str] = None
    target_livestock: Optional[str] = None


class PestIdentifyIn(BaseModel):
    user_id: Optional[int] = None
    crop_type: str
    image_url: str
    file_name: Optional[str] = None
    context_hint: Optional[str] = None
