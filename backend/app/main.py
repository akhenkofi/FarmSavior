from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
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
    except Exception:
        pass


ensure_runtime_columns()

app = FastAPI(title=settings.APP_NAME, version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(router)


@app.middleware('http')
async def capture_analytics(request: Request, call_next):
    response = await call_next(request)
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
