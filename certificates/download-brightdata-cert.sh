#!/bin/bash

# Download BrightData SSL Certificate
# This is the new certificate that works with port 33335 (expires 2034)

echo "📥 Downloading BrightData SSL Certificate..."

# The certificate URL from BrightData documentation
CERT_URL="https://brightdata.com/static/ca-cert-new.zip"
CERT_DIR="$(dirname "$0")"

# Download the certificate zip file
curl -o "$CERT_DIR/ca-cert-new.zip" "$CERT_URL"

# Unzip the certificate
unzip -o "$CERT_DIR/ca-cert-new.zip" -d "$CERT_DIR"

# Clean up the zip file
rm "$CERT_DIR/ca-cert-new.zip"

echo "✅ BrightData certificate downloaded to: $CERT_DIR/ca.crt"
echo ""
echo "Certificate details:"
openssl x509 -in "$CERT_DIR/ca.crt" -text -noout | grep -E "Subject:|Issuer:|Not Before|Not After"

echo ""
echo "🔐 Certificate is ready to use with port 33335"