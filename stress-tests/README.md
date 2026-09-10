# ToToggle Stress Tests

Conjunto de testes de carga para o servidor ToToggle e para os SDKs Go, Node e Java em aplicações HTTP reais. O cenário de SDK chama cada sidecar local via `POST /evaluate`; portanto, ele mede avaliação em memória, contexto de request e sincronização em background, sem reproduzir a lógica dos SDKs no Gatling.

## 🎯 Objetivo

Este módulo de teste tem como objetivo principal determinar:

- **Quantas chamadas simultâneas** o servidor ToToggle consegue suportar
- **Tempo de resposta** sob diferentes cargas de trabalho
- **Limites de capacidade** e pontos de falha
- **Comportamento** durante picos de tráfego
- **Estabilidade** durante uso prolongado

## 🏗️ Estrutura

```
stress-tests/
├── build.gradle.kts                     # Configuração do projeto Gatling
├── src/
│   ├── main/
│   │   ├── kotlin/setup/
│   │   │   └── TestDataSetup.kt         # Setup de dados de teste
│   │   └── resources/
│   │       └── application.conf         # Configurações
│   └── gatling/scala/simulations/
│       ├── ToToggleStressSimulation.scala    # Teste básico de stress
│       ├── CapacityTestSimulation.scala      # Teste de capacidade
│       └── SpikeTestSimulation.scala         # Teste de picos
│       └── SdkContextStressSimulation.scala  # Mix contextual dos três SDKs
│   └── gatling/resources/
│       └── sdk-stress-scenarios.json         # Casos determinísticos do mix SDK
├── sdk-runners/                         # Sidecars Go e Node com SDKs reais
├── sidecars/java/                       # Instruções do sidecar Java
├── run-stress-tests.sh                  # Script principal de execução
└── README.md                           # Esta documentação
```

## 🚀 Quick Start

### 1. Pré-requisitos

- **Java 21**
- **Go** e **Node 20+** para os sidecars correspondentes
- **Servidor ToToggle** executando (padrão: http://localhost:3056)

### 2. Instalação

```bash
cd stress-tests
./gradlew build
```

### 3. Execução Rápida

```bash
# Executar todos os testes
./run-stress-tests.sh

# Executar apenas teste básico
./run-stress-tests.sh basic

# Executar teste de capacidade
./run-stress-tests.sh capacity

# Executar teste de picos
./run-stress-tests.sh spike

# Executar somente o mix contextual contra Go, Node e Java
./run-stress-tests.sh sdk
```

### Sidecars dos SDKs

Inicie os três sidecars antes do comando `sdk`. Eles são processos locais separados para que Gatling não crie nem compartilhe clientes SDK entre usuários virtuais.

| SDK | URL padrão | Contrato |
| --- | --- | --- |
| Go | `http://127.0.0.1:19091` | `POST /evaluate` |
| Node | `http://127.0.0.1:19092` | `POST /evaluate` |
| Java | `http://127.0.0.1:19093` | `POST /evaluate` |

O corpo é somente contexto de domínio:

```json
{"path":"stress.local-rule","context":{"userId":"user-pro","attributes":{"plan":"pro"}}}
```

IP e país nunca são aceitos no corpo. O Gatling os envia em `Forwarded` e `CF-IPCountry`, para que os adapters HTTP de cada SDK façam a extração com a política de proxy confiável.

O mix determinístico está em [`src/gatling/resources/sdk-stress-scenarios.json`](src/gatling/resources/sdk-stress-scenarios.json): sem regra, regra local, bloqueio hierárquico, país, IPv4, IPv6, contexto ausente e contexto de rede malformado. Cada resposta precisa ter exatamente `{"active": boolean}` e é verificada contra o resultado esperado. A sincronização condicional (`ETag`/`304`) e falhas do catálogo permanecem internas aos SDKs: os sidecars as exercitam com seus ciclos de refresh configurados, sem expor um endpoint de controle inseguro.

Prepare o catálogo uma vez antes de iniciar os sidecars. A chave é extraída somente para a variável de ambiente do terminal atual; não a copie para comandos, logs ou arquivos versionados.

```bash
STRESS_SETUP_USERNAME=operator STRESS_SETUP_PASSWORD='…' ./run-stress-tests.sh setup
export STRESS_SERVER_URL="${SERVER_URL:-http://localhost:3056}"
export STRESS_SECRET_KEY="$(node -e 'const f=require("fs"); process.stdout.write(JSON.parse(f.readFileSync("test-data.json")).applications[0].secretKey)')"
```

Em três terminais separados, execute:

```bash
(cd sdk-runners/go && go run .)
(cd sdk-runners/node && npm run build && node dist/main.js)
./gradlew runJavaSdkSidecar
```

Então execute `./run-stress-tests.sh sdk`. Os sidecars expõem somente loopback, recusam payloads fora do contrato e recusam catálogo remoto salvo com `ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes` explícito. A mesma confirmação é exigida pelo runner.

## 📊 Cenários de Teste

### 1. Teste Básico de Stress (`ToToggleStressSimulation`)

**Objetivo:** Validar comportamento sob carga normal e alta concorrência.

**Cenários:**
- **Basic Load:** 250 usuários, 50 requests/usuário
- **High Concurrency:** 500 usuários, 100 requests/usuário  
- **Mixed Workload:** 250 usuários, múltiplas consultas sequenciais
- **Burst Test:** 100 usuários, rajadas de 20 requests

**Métricas Esperadas:**
- Tempo médio de resposta: < 500ms
- 95º percentil: < 1000ms
- Taxa de sucesso: > 99%

### 2. Teste de Capacidade (`CapacityTestSimulation`)

**Objetivo:** Encontrar o limite máximo de throughput do servidor.

**Comportamento:**
- Incrementa carga gradualmente: 10 → 2000 usuários
- Passos de 50 usuários a cada 30 segundos
- Identifica ponto de saturação

**Uso:**
```bash
MAX_USERS=2000 ./run-stress-tests.sh capacity
```

### 3. Teste de Picos (`SpikeTestSimulation`)

**Objetivo:** Testar recuperação após picos súbitos de tráfego.

**Comportamento:**
- Carga normal: 50 usuários constantes
- 5 picos de 500 usuários por 30 segundos
- Valida estabilidade após cada pico

## 🔧 Configuração

### Variáveis de Ambiente

```bash
export SERVER_URL="http://localhost:3056"    # URL do servidor
export MAX_USERS=1000                        # Usuários máximos
export TEST_DURATION=300                     # Duração do teste (segundos)
export RAMP_UP_DURATION=60                   # Tempo de ramp-up (segundos)
export SDK_GO_URL="http://127.0.0.1:19091"
export SDK_NODE_URL="http://127.0.0.1:19092"
export SDK_JAVA_URL="http://127.0.0.1:19093"
```

O runner recusa qualquer URL fora de loopback por padrão. Para um ambiente aprovado, use a confirmação explícita no mesmo comando:

```bash
ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes SERVER_URL=https://approved.example ./run-stress-tests.sh sdk
```

Essa confirmação também se aplica às URLs dos sidecars. O script não imprime segredos. O setup exige `STRESS_SETUP_USERNAME` e uma de `STRESS_SETUP_PASSWORD` ou `STRESS_SETUP_PASSWORD_FILE`; o segundo formato permite consumir a senha bootstrap owner-only sem expô-la no ambiente. Não existem credenciais administrativas padrão. Os fixtures que contêm secret keys são gravados com permissão de proprietário quando o sistema operacional suporta POSIX e nunca devem ser versionados ou enviados a relatórios.

### Dados de Teste

O setup autenticado automaticamente cria:
- **5 aplicações** com secret keys únicos
- **7 toggles de cenário por aplicação**, mais o pai `stress` criado pela hierarquia
- O catálogo determinístico de regra local, país, IPv4, IPv6 e bloqueio hierárquico

Estrutura criada por aplicação:
```
stress
├── no-rule
├── local-rule          (attribute attributes.plan = pro)
├── parent-disabled     (desligado)
│   └── child
├── country-rule        (country = BR)
├── ipv4-rule           (203.0.113.0/24)
└── ipv6-rule           (2001:db8::/32)
```

## 📈 Relatórios

### Durante os Testes

```bash
# Monitor em tempo real
tail -f stress-test.log

# Verificar progresso
watch "grep -E '(users|requests)' stress-test.log | tail -5"
```

### Após os Testes

Os relatórios são gerados em:
- `build/reports/gatling/[simulation-name]/index.html`
- `stress-test-summary.md` (resumo executivo)

### Métricas Principais

1. **Response Times:**
   - Mean, 95th percentile, 99th percentile
   - Distribuição ao longo do tempo

2. **Throughput:**
   - Requests por segundo
   - Usuários ativos concorrentes

3. **Success Rate:**
   - Taxa de requisições bem-sucedidas
   - Distribuição de códigos de erro

4. **Performance Under Load:**
   - Degradação com aumento de carga
   - Pontos de saturação

## 🎯 Cenários de Uso

### Teste Local de Desenvolvimento
```bash
# Teste rápido com poucos usuários
MAX_USERS=100 TEST_DURATION=60 ./run-stress-tests.sh basic
```

### Validação Pré-Produção
```bash
# Teste completo com carga realística
MAX_USERS=1000 TEST_DURATION=600 ./run-stress-tests.sh all
```

### Teste de Capacidade Máxima
```bash
# Encontrar limites do servidor
MAX_USERS=5000 ./run-stress-tests.sh capacity
```

### Simulação de Tráfego de Produção
```bash
# Teste com picos realísticos
./run-stress-tests.sh spike
```

## 🔍 Análise de Resultados

### Interpretação de Métricas

**✅ Bom Performance:**
- Tempo médio < 200ms
- 95º percentil < 500ms
- Taxa de sucesso > 99.5%
- Throughput linear com carga

**⚠️ Atenção:**
- Tempo médio 200-500ms
- 95º percentil 500-1000ms
- Taxa de sucesso 95-99%
- Degradação gradual

**❌ Problemas:**
- Tempo médio > 500ms
- 95º percentil > 1000ms
- Taxa de sucesso < 95%
- Falhas em cascata

### Bottlenecks Comuns

1. **CPU Bound:**
   - Response time aumenta linearmente
   - Throughput se estabiliza

2. **Memory Bound:**
   - GC pauses frequentes
   - Response time volátil

3. **I/O Bound:**
   - Timeouts de conexão
   - Errors intermitentes

4. **Concurrency Issues:**
   - Deadlocks
   - Race conditions

## 🛠️ Troubleshooting

### Problemas Comuns

**Server não responde:**
```bash
# Verificar se o servidor está rodando
curl -v http://localhost:8080/health
```

**Testes falham imediatamente:**
```bash
# Verificar dados de teste
./run-stress-tests.sh setup
cat test-data.json | jq '.metadata'
```

**Performance ruim:**
```bash
# Reduzir carga inicial
MAX_USERS=50 ./run-stress-tests.sh basic
```

**Erros de autenticação:**
- Verificar se as secret keys estão sendo geradas corretamente
- Confirmar formato esperado pelo servidor

### Debug Mode

```bash
# Executar com logs detalhados
export GATLING_OPTS="-Dlogback.configurationFile=logback-debug.xml"
./run-stress-tests.sh basic
```

## 📝 Customização

### Adicionando Novos Cenários

1. Criar nova simulação em `src/gatling/scala/simulations/`
2. Implementar lógica específica do teste
3. Adicionar ao script `run-stress-tests.sh`

### Modificando Dados de Teste

Editar `TestDataSetup.kt` para:
- Alterar número de aplicações/toggles
- Modificar estrutura hierárquica
- Customizar activation rules

### Configurações Avançadas

Editar `application.conf` para:
- Ajustar timeouts
- Modificar formatos de relatório
- Configurar métricas específicas

## 🤝 Contribuição

Para adicionar novos testes ou melhorar existentes:

1. Criar feature branch
2. Implementar mudanças
3. Testar localmente
4. Submeter PR com documentação

## 📞 Suporte

- **Issues:** [GitHub Issues](https://github.com/manorfm/toToggles/issues)
- **Documentação:** [Wiki do Projeto](https://github.com/manorfm/toToggles/wiki)

---

**🎯 Objetivo Final:** Garantir que o ToToggle Server possa suportar milhares de consultas simultâneas com excelente performance e estabilidade.
