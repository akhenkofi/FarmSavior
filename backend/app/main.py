from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.data_lake import write_jsonl
from app.db.session import Base, engine
from app.api.routes import router

Base.metadata.create_all(bind=engine)

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
