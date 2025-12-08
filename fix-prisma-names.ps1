# Script para arreglar nombres de modelos de Prisma
$files = @(
    "src\services\adminService.ts",
    "src\scripts\create_master_user.ts",
    "src\controllers\dashboardController.ts",
    "src\services\stripeService.ts",
    "src\controllers\whatsappController.ts",
    "src\scripts\seed.ts"
)

foreach ($file in $files) {
    $content = Get-Content $file -Raw
    $content = $content -replace 'prisma\.company', 'prisma.companies'
    $content = $content -replace 'prisma\.plan', 'prisma.plans'
    Set-Content $file $content -NoNewline
    Write-Host "✅ Fixed: $file"
}

Write-Host "`n🎉 All files updated!"
