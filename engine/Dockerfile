FROM python:3.12-slim

WORKDIR /app

# Install system dependencies: the independent R survey reference needs R and
# the survey/haven/digest/jsonlite packages; git lets the scientific worker
# record the repository revision it ran against.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    git \
    r-base-core \
    r-cran-survey \
    r-cran-haven \
    r-cran-digest \
    r-cran-jsonlite \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code to match repo structure (engine/ireme/ -> /app/engine/ireme/)
COPY engine/ireme/ ./engine/ireme/
COPY engine/reference/ ./engine/reference/

# Copy policy files and JSON schemas to match repo structure (policies power the
# gateway and release gate; schemas validate indicator and investigation contracts).
COPY IREME_INSIGHT_FULL_ENGINE_KIT/09_MACHINE_CONTRACTS/policies/ ./IREME_INSIGHT_FULL_ENGINE_KIT/09_MACHINE_CONTRACTS/policies/
COPY IREME_INSIGHT_FULL_ENGINE_KIT/09_MACHINE_CONTRACTS/schemas/ ./IREME_INSIGHT_FULL_ENGINE_KIT/09_MACHINE_CONTRACTS/schemas/

# The licensed EICV7 archive stays inside the machine; the API never exposes rows.
# The archive ships from engine/.ship because the NISR Data/ tree is git-ignored
# and therefore never reaches the remote build context.
COPY ["engine/.ship/EICV7.zip", "/app/Data/Track 2 - Financial Inclusion and Poverty Reduction/T2 Finance and Poverty - Household Living Conditions Survey EICV7 2023-2024.zip"]

# Hackathon demo: the data-request correspondence recorded as approval evidence.
COPY docs/NISR_DATA_REQUEST.md /app/demo/NISR_DATA_REQUEST.md

# The image is built from a working tree, not a clone: snapshot it as its own revision.
RUN git init -q /app && git -C /app config user.email "engine@ireme.local" && \
    git -C /app config user.name "Ireme Engine" && \
    git -C /app add -A && git -C /app commit -qm "engine image snapshot"

# Expose port (Fly.io expects 8080 by default)
EXPOSE 8080

# Seed the demonstration catalog when a fresh machine boots, then serve the API.
CMD ["sh", "-c", "python -m engine.ireme.bootstrap; exec python -m uvicorn engine.ireme.api:configured_app --factory --app-dir /app --host 0.0.0.0 --port 8080"]
