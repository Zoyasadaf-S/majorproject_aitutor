$ErrorActionPreference = "Stop"

$backendDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPython = Join-Path $backendDirectory "venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $backendPython)) {
    throw "Backend virtual environment not found at '$backendPython'. Create it and install requirements.txt before starting the API."
}

Set-Location -LiteralPath $backendDirectory
# Uvicorn's Windows reload worker can fall back to the base Python executable,
# bypassing this venv's installed PDF and OCR dependencies.
& $backendPython -m uvicorn main:app --port 8000 @args
exit $LASTEXITCODE
