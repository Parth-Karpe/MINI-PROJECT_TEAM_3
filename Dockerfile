FROM python:3.11-slim

WORKDIR /app

# Install deps first for better layer caching
COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source and install the package itself (editable is fine in-container)
COPY src ./src
COPY api ./api
COPY ui ./ui
RUN pip install --no-cache-dir -e .

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
