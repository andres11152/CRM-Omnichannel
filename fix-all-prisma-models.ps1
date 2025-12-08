# Script completo para arreglar TODOS los nombres de modelos de Prisma
$files = Get-ChildItem -Path "src" -Recurse -Include *.ts

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    
    # Reemplazos de modelos
    $content = $content -replace 'prisma\.company\b', 'prisma.companies'
    $content = $content -replace 'prisma\.plan\b', 'prisma.plans'
    $content = $content -replace 'prisma\.aIConfig\b', 'prisma.ai_configs'
    $content = $content -replace 'prisma\.aIAssistant\b', 'prisma.ai_assistants'
    
    if ($content -ne $original) {
        Set-Content $file.FullName $content -NoNewline
        Write-Host "✅ Fixed: $($file.FullName)"
    }
}

Write-Host "`n🎉 All Prisma model names updated!"
