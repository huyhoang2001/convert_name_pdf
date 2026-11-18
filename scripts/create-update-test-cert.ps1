$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dir = Join-Path $root '.b6h-state/update-test-keys'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
if (!(Test-Path $openssl)) { throw 'Git for Windows OpenSSL is unavailable.' }
$caKey = Join-Path $dir 'local-test-ca-key.pem'
$caCert = Join-Path $dir 'local-test-ca.pem'
$serverKey = Join-Path $dir 'local-test-server-key.pem'
$csr = Join-Path $dir 'local-test-server.csr'
$serverCert = Join-Path $dir 'local-test-server.pem'
$pfx = Join-Path $dir 'local-test-server.pfx'
if (@($caKey, $caCert, $serverKey, $csr, $serverCert, $pfx | Where-Object { Test-Path $_ }).Count) { throw 'Refusing to overwrite existing isolated test TLS material.' }
& $openssl req -x509 -newkey rsa:3072 -nodes -keyout $caKey -out $caCert -days 1095 -subj '/CN=B6H Isolated Update Test CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign'
if ($LASTEXITCODE) { throw 'Could not generate isolated test CA.' }
& $openssl req -new -newkey rsa:2048 -nodes -keyout $serverKey -out $csr -subj '/CN=localhost'
if ($LASTEXITCODE) { throw 'Could not generate localhost test key.' }
$extensions = Join-Path $dir 'local-test-server-ext.cnf'
@('[server]', 'basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment', 'extendedKeyUsage=serverAuth', 'subjectAltName=DNS:localhost,IP:127.0.0.1') | Set-Content -Encoding ascii $extensions
& $openssl x509 -req -in $csr -CA $caCert -CAkey $caKey -CAcreateserial -out $serverCert -days 365 -extfile $extensions -extensions server
if ($LASTEXITCODE) { throw 'Could not issue localhost test certificate.' }
& $openssl pkcs12 -export -out $pfx -inkey $serverKey -in $serverCert -passout 'pass:B6H-local-test-only'
if ($LASTEXITCODE) { throw 'Could not package localhost test certificate.' }
Remove-Item -LiteralPath $csr, $extensions, (Join-Path $dir 'local-test-ca.srl') -Force -ErrorAction SilentlyContinue
Write-Output "Created isolated TLS test CA and localhost server certificate under $dir"
