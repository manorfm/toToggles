#!/bin/bash

# Exemplos de uso da API ToToggle
# Execute este script para testar as funcionalidades

BASE_URL="http://localhost:8081"

echo "=== ToToggle API Examples ==="
echo

# 1. Criar uma aplicação
echo "1. Criando aplicação..."
APP_RESPONSE=$(curl -s -X POST $BASE_URL/applications \
  -H "Content-Type: application/json" \
  -d '{"name": "Minha Aplicação"}')

echo "Resposta: $APP_RESPONSE"
APP_ID=$(echo $APP_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "App ID: $APP_ID"
echo

# 2. Criar toggles hierárquicos
echo "2. Criando toggle hierárquico..."
curl -s -X POST $BASE_URL/applications/$APP_ID/toggles \
  -H "Content-Type: application/json" \
  -d '{"toggle": "esse.campo.pode.ser.extenso", "enabled": true}'
echo
echo "Toggle criado: esse.campo.pode.ser.extenso"
echo

# 3. Verificar status dos toggles
echo "3. Verificando status dos toggles..."
echo "Status de 'esse':"
curl -s -X GET "$BASE_URL/applications/$APP_ID/toggles/status?path=esse" | jq .
echo

echo "Status de 'esse.campo':"
curl -s -X GET "$BASE_URL/applications/$APP_ID/toggles/status?path=esse.campo" | jq .
echo

echo "Status de 'esse.campo.pode':"
curl -s -X GET "$BASE_URL/applications/$APP_ID/toggles/status?path=esse.campo.pode" | jq .
echo

echo "Status de 'esse.campo.pode.ser':"
curl -s -X GET "$BASE_URL/applications/$APP_ID/toggles/status?path=esse.campo.pode.ser" | jq .
echo

echo "Status de 'esse.campo.pode.ser.extenso':"
curl -s -X GET "$BASE_URL/applications/$APP_ID/toggles/status?path=esse.campo.pode.ser.extenso" | jq .
echo

# 4. Desabilitar um toggle pai
echo "4. Desabilitando toggle pai 'esse.campo.pode'..."
curl -s -X PUT "$BASE_URL/applications/$APP_ID/toggles?path=esse.campo.pode" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
echo
echo "Toggle 'esse.campo.pode' desabilitado"
echo

# 5. Verificar status novamente (deve retornar false para todos os filhos)
echo "5. Verificando status após desabilitar pai..."
echo "Status de 'esse.campo.pode.ser.extenso' (deve ser false):"
curl -s -X GET "$BASE_URL/applications/$APP_ID/toggles/status?path=esse.campo.pode.ser.extenso" | jq .
echo

# 6. Listar hierarquia de toggles
echo "6. Listando hierarquia de toggles..."
curl -s -X GET "$BASE_URL/applications/$APP_ID/toggles?hierarchy=true" | jq .
echo

# 7. Listar todas as aplicações
echo "7. Listando todas as aplicações..."
curl -s -X GET $BASE_URL/applications | jq .
echo

echo "=== Testes concluídos ===" 