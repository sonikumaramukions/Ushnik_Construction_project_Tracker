from pathlib import Path
from datetime import timedelta
import os
import dj_database_url

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# SECURITY WARNING:
# In production, SECRET_KEY, DEBUG, and ALLOWED_HOSTS are driven by environment
# variables so that deploying the API behind a load balancer or container
# does not require code changes.
SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-^tes09o0-0!zq5u73vrq8-plzwqys04tn!57j(!)a*vf#6(bz$",
)

DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() in {"1", "true", "yes"}

# In production (Render), set DJANGO_ALLOWED_HOSTS to your Render domain:
# e.g. "your-app.onrender.com" (space-separated for multiple)
_raw_hosts = os.getenv("DJANGO_ALLOWED_HOSTS", "")
ALLOWED_HOSTS = _raw_hosts.split() if _raw_hosts else ["localhost", "127.0.0.1"]

# Trust Render and Vercel origins for CSRF
_trusted_raw = os.getenv("CSRF_TRUSTED_ORIGINS", "")
CSRF_TRUSTED_ORIGINS = _trusted_raw.split() if _trusted_raw else []


# Application definition

INSTALLED_APPS = [
    # Django core
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third‑party
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'whitenoise.runserver_nostatic',

    # Local apps
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise must be right after SecurityMiddleware to serve static files in production
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# On Render, set DATABASE_URL env var (auto-provided when you attach a PostgreSQL db).
# Locally, falls back to SQLite for easy setup.
_DATABASE_URL = os.getenv("DATABASE_URL", "")
if _DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.config(
            default=_DATABASE_URL,
            conn_max_age=600,
            conn_health_checks=True,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = '/static/'
# WhiteNoise requires STATIC_ROOT to collect static files into.
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Django 4.2+ uses STORAGES dict; we set WhiteNoise as the static files backend
# for compressed, cache-busted static file serving in production.
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

AUTH_USER_MODEL = 'core.User'

REST_FRAMEWORK = {
    # Globally use JWT for API authentication; session auth can be added for
    # Django admin later if needed.
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # Protect the API from unbounded result sets and excessive traffic spikes.
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": int(os.getenv("DRF_PAGE_SIZE", "100")),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ],
    # Reasonable defaults; can be tuned per‑env via environment variables.
    "DEFAULT_THROTTLE_RATES": {
        "user": os.getenv("DRF_THROTTLE_USER", "1000/hour"),
        "anon": os.getenv("DRF_THROTTLE_ANON", "100/hour"),
    },
}

SIMPLE_JWT = {
    # Tokens are short‑lived for safety; frontend will use refresh tokens.
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "60"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# CORS
# In production, set CORS_ALLOWED_ORIGINS env var to your Vercel frontend URL(s):
# e.g. "https://your-app.vercel.app" (space-separated for multiple)
_default_cors = [
    "http://localhost:5173",
    "http://localhost:5174",
]
extra_cors = os.getenv("CORS_ALLOWED_ORIGINS", "")
if extra_cors:
    _default_cors.extend([origin for origin in extra_cors.split() if origin])

CORS_ALLOWED_ORIGINS = _default_cors

# Allow credentials in cross-origin requests (needed for JWT in headers)
CORS_ALLOW_CREDENTIALS = True
