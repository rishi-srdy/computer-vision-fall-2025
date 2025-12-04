# Use a Python base image
FROM python:3.10-slim

# Install system dependencies (for OpenCV, mediapipe, etc.)
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /app

# Copy requirements first (for better caching)
COPY requirements.txt .

# Install Python deps
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy the rest of the project
COPY . .

# Expose port (Railway will map PORT env)
EXPOSE 5000

# Default command uses gunicorn
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]
