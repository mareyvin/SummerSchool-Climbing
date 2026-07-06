@echo off
REM Скрипт для проверки работоспособности API сервера "Вертикаль"

set BASE_URL=http://localhost:3000

echo === Проверка сервера ===
echo 1. Проверка health endpoint:
curl -s %BASE_URL%/health
echo.
echo.

echo 2. Запрос OTP кода:
curl -s -X POST %BASE_URL%/auth/otp/request -H "Content-Type: application/json" -d "{\"phone\":\"+79991234567\"}"
echo.
echo.

echo 3. Попытка доступа к защищённому эндпоинту без токена:
curl -s -X GET %BASE_URL%/slots
echo.
echo.

echo 4. Попытка доступа к /profile без токена:
curl -s -X GET %BASE_URL%/profile
echo.
echo.

echo === Проверка завершена ===
