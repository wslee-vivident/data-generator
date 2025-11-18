$PROJECT_ID="game-design-476609"
$REGION="asia-northeast3"
$REPO="data-generator"
$IMAGE_NAME="data-generate-api"
$SERVICE_NAME="data-generate-api"

$IMAGE_URL="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME`:latest"

Write-Host "=== Build ==="
gcloud builds submit --tag $IMAGE_URL .

Write-Host "=== Deploy ==="
gcloud run deploy $SERVICE_NAME `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated

Write-Host "=== Complete ==="