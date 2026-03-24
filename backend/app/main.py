from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from app.core.config import settings
from app.core.data_lake import write_jsonl
from sqlalchemy import inspect, text
from app.db.session import Base, engine
from app.api.routes import router

Base.metadata.create_all(bind=engine)


def ensure_runtime_columns():
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        with engine.begin() as conn:
            if 'community_profiles' in tables:
                cols = {c['name'] for c in inspector.get_columns('community_profiles')}
                if 'username' not in cols:
                    conn.execute(text('ALTER TABLE community_profiles ADD COLUMN username VARCHAR(80)'))

            if 'id_verifications' in tables:
                vcols = {c['name'] for c in inspector.get_columns('id_verifications')}
                if 'id_front_photo_url' not in vcols:
                    conn.execute(text('ALTER TABLE id_verifications ADD COLUMN id_front_photo_url VARCHAR(500)'))
                if 'id_back_photo_url' not in vcols:
                    conn.execute(text('ALTER TABLE id_verifications ADD COLUMN id_back_photo_url VARCHAR(500)'))

            if 'users' in tables:
                ucols = {c['name'] for c in inspector.get_columns('users')}
                if 'email' not in ucols:
                    conn.execute(text('ALTER TABLE users ADD COLUMN email VARCHAR(160)'))
                if 'is_deleted' not in ucols:
                    conn.execute(text('ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT 0'))
                if 'deleted_at' not in ucols:
                    conn.execute(text('ALTER TABLE users ADD COLUMN deleted_at DATETIME'))


            for table_name in ['crop_listings', 'livestock_listings', 'logistics_requests', 'equipment_rentals', 'storage_reservations']:
                if table_name in tables:
                    cols = {c['name'] for c in inspector.get_columns(table_name)}
                    if 'image_urls' not in cols:
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN image_urls TEXT DEFAULT '[]'"))
                    if 'cover_image_url' not in cols:
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN cover_image_url TEXT"))




            if 'marketplace_orders' in tables:
                ocols = {c['name'] for c in inspector.get_columns('marketplace_orders')}
                extra = {
                    'auto_release_at': 'DATETIME',
                    'released_at': 'DATETIME',
                    'refunded_at': 'DATETIME'
                }
                for col, ddl in extra.items():
                    if col not in ocols:
                        conn.execute(text(f'ALTER TABLE marketplace_orders ADD COLUMN {col} {ddl}'))
            if 'seller_payout_profiles' in tables:
                pcols = {c['name'] for c in inspector.get_columns('seller_payout_profiles')}
                required = {
                    'user_id': 'INTEGER', 'country': "VARCHAR(10) DEFAULT 'GH'", 'payout_method': "VARCHAR(40) DEFAULT 'MOBILE_MONEY'",
                    'account_name': 'VARCHAR(160)', 'bank_name': 'VARCHAR(120)', 'account_number': 'VARCHAR(120)',
                    'mobile_money_provider': 'VARCHAR(80)', 'mobile_money_number': 'VARCHAR(80)', 'currency': "VARCHAR(10) DEFAULT 'GHS'",
                    'is_verified': 'BOOLEAN DEFAULT 0', 'verification_status': "VARCHAR(40) DEFAULT 'PENDING'", 'default_payout_method': 'BOOLEAN DEFAULT 1',
                    'updated_at': 'DATETIME'
                }
                for col, ddl in required.items():
                    if col not in pcols:
                        conn.execute(text(f'ALTER TABLE seller_payout_profiles ADD COLUMN {col} {ddl}'))
            if 'marketplace_orders' in tables:
                ocols = {c['name'] for c in inspector.get_columns('marketplace_orders')}
                required = {
                    'buyer_id': 'INTEGER', 'seller_id': 'INTEGER', 'listing_type': 'VARCHAR(30)', 'listing_id': 'INTEGER',
                    'listing_title': 'VARCHAR(180)', 'quantity': 'FLOAT DEFAULT 1', 'unit_price': 'FLOAT DEFAULT 0',
                    'gross_amount': 'FLOAT DEFAULT 0', 'platform_fee': 'FLOAT DEFAULT 0', 'processing_fee': 'FLOAT DEFAULT 0',
                    'seller_net': 'FLOAT DEFAULT 0', 'currency': "VARCHAR(10) DEFAULT 'GHS'", 'escrow_status': "VARCHAR(40) DEFAULT 'AWAITING_PAYMENT'",
                    'fulfillment_status': "VARCHAR(40) DEFAULT 'PENDING'", 'payment_status': "VARCHAR(40) DEFAULT 'UNPAID'", 'payout_status': "VARCHAR(40) DEFAULT 'HELD'",
                    'delivery_method': "VARCHAR(60) DEFAULT 'STANDARD'", 'delivery_note': 'TEXT', 'buyer_note': 'TEXT', 'seller_note': 'TEXT',
                    'payment_reference': 'VARCHAR(120)', 'updated_at': 'DATETIME'
                }
                for col, ddl in required.items():
                    if col not in ocols:
                        conn.execute(text(f'ALTER TABLE marketplace_orders ADD COLUMN {col} {ddl}'))

            if 'otp_codes' in tables:
                ocols = {c['name'] for c in inspector.get_columns('otp_codes')}
                if 'destination' not in ocols:
                    conn.execute(text('ALTER TABLE otp_codes ADD COLUMN destination VARCHAR(160)'))
                if 'channel' not in ocols:
                    conn.execute(text("ALTER TABLE otp_codes ADD COLUMN channel VARCHAR(20) DEFAULT 'phone'"))
    except Exception:
        pass


ensure_runtime_columns()

app = FastAPI(title=settings.APP_NAME, version='0.1.0')

allowed_origins = [o.strip() for o in str(settings.FRONTEND_ORIGINS or '').split(',') if o.strip()]
if not allowed_origins:
    allowed_origins = ['https://www.farmsavior.com']

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type', 'X-Requested-With'],
)

app.include_router(router)


@app.middleware('http')
async def security_and_capture(request: Request, call_next):
    # Enforce HTTPS behind reverse proxies/load balancers.
    proto = request.headers.get('x-forwarded-proto', request.url.scheme)
    if settings.FORCE_HTTPS and proto == 'http':
        https_url = str(request.url).replace('http://', 'https://', 1)
        return RedirectResponse(url=https_url, status_code=307)

    response = await call_next(request)

    # Security headers baseline
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(self)'
    response.headers['Content-Security-Policy'] = "default-src 'self'; frame-ancestors 'none'; upgrade-insecure-requests"

    if request.url.path.startswith('/api/v1'):
        write_jsonl('raw/events/api_requests.jsonl', {
            'path': request.url.path,
            'method': request.method,
            'status_code': response.status_code,
            'query': dict(request.query_params),
            'client': request.client.host if request.client else None,
            'user_agent': request.headers.get('user-agent', ''),
        })
    return response


@app.get('/')
def health():
    return {'status': 'ok', 'service': settings.APP_NAME}
