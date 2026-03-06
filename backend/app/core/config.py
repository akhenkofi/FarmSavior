from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')

    APP_NAME: str = 'FarmSavior API'
    SECRET_KEY: str = 'change-me'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    DATABASE_URL: str = 'sqlite:///./farmsavior.db'
    OTP_BYPASS_CODE: str = '123456'

    OWNER_PAYOUT_MOMO_GH: str = ''
    OWNER_PAYOUT_US_BANK: str = ''

    PAYSTACK_SECRET_KEY: str = ''
    PAYSTACK_PUBLIC_KEY: str = ''
    PAYSTACK_WEBHOOK_SECRET: str = ''
    PAYSTACK_CALLBACK_URL: str = 'https://www.farmsavior.com/?public=0&go=onboarding'

    # Optional external AI connectors
    PLANT_ID_API_KEY: str = ''


settings = Settings()
