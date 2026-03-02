#!/usr/bin/env bash
# Render Build Script for Django Backend
# This script runs during the build phase on Render before the server starts.
set -o errexit

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Collecting static files..."
python manage.py collectstatic --no-input

echo "==> Applying database migrations..."
python manage.py migrate

echo "==> Build complete."
