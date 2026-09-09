# ToToggle Stress Tests

Conjunto abrangente de testes de stress para validar a performance e capacidade do servidor ToToggle, com foco especial em consultas simultâneas via secret key.

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
├── run-stress-tests.sh                  # Script principal de execução
└── README.md                           # Esta documentação
```

## 🚀 Quick Start

### 1. Pré-requisitos

- **Java 17+**
- **Gradle 8.7+**
- **Servidor ToToggle** executando (padrão: http://localhost:8080)

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
```

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
export SERVER_URL="http://localhost:8080"    # URL do servidor
export MAX_USERS=1000                        # Usuários máximos
export TEST_DURATION=300                     # Duração do teste (segundos)
export RAMP_UP_DURATION=60                   # Tempo de ramp-up (segundos)
```

### Dados de Teste

O sistema automaticamente cria:
- **20 aplicações** com secret keys únicos
- **20 toggles por aplicação** (até 400 toggles total)
- **Hierarquia de toggles** (ex: `user.payments.view-table`)
- **Activation rules** variadas (percentage, attribute)

Exemplo de estrutura criada:
```
user                     (90% habilitado)
├── profile             (85% habilitado) 
├── settings            (85% habilitado)
└── dashboard           (85% habilitado)
    ├── view            (80% habilitado)
    └── edit            (80% habilitado)
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
