---
name: orm-gorm-sqlite
description: Padrões de uso do ORM GORM com SQLite no projeto
frameworks:
  - gorm
  - sqlite
---

# GORM & SQLite Best Practices

Esta skill instrui o agente sobre como lidar com o banco de dados e o ORM GORM.

## Diretrizes de Implementação

1. **Definição de Tabelas:**
   - Utilize as `structs` das entidades (em `internal/app/domain/entity`) para mapear as tabelas.
   - Sempre utilize tags do GORM como `gorm:"primaryKey;type:..."` para mapeamento preciso.
   
2. **Conexão:**
   - O projeto utiliza SQLite via `gorm.io/driver/sqlite`.
   
3. **Padrão de Repositório:**
   - Todas as operações (Create, First, Find, Save, Delete) devem estar dentro da camada de Repositório (implementação em `internal/app/infrastructure/database`).
   - Evite vazamento de dependência do `gorm.DB` nas camadas de `Usecase` ou `Handler`.
   
4. **Hooks de Banco:**
   - Utilize o hook funcional `BeforeCreate` nas structs de Entidade para delegar, por exemplo, a geração do UUID/ULID ou *hashing* de senhas antes da inserção.
