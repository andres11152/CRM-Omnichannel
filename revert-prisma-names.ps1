# Script para REVERTIR los cambios de nombres de modelos de Prisma
# Ahora que tenemos @@map, Prisma genera nombres SINGULARES
$files = Get-ChildItem -Path "src" -Recurse -Include *.ts

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    
    # Revertir los cambios (de plural a singular)
    $content = $content -replace 'prisma\.companies\b', 'prisma.company'
    $content = $content -replace 'prisma\.plans\b', 'prisma.plan'
    $content = $content -replace 'prisma\.ai_configs\b', 'prisma.aIConfig'
    $content = $content -replace 'prisma\.ai_assistants\b', 'prisma.aIAssistant'
    
    if ($content -ne $original) {
        Set-Content $file.FullName $content -NoNewline
        Write-Host "✅ Reverted: $($file.FullName)"
    }
}

Write-Host "`n🎉 All Prisma model names reverted to singular!"
