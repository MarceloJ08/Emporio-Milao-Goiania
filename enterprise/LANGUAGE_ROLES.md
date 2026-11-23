# Language and Runtime Ownership

| Technology | Planned responsibility | Adoption rule |
|---|---|---|
| TypeScript | Core app, APIs, validation and contracts | Primary language for web platform |
| JavaScript | Existing code and compatibility | Avoid parallel duplicate implementations |
| Python | Analytics, automation and data tasks | Isolated, testable workloads |
| Go | Focused concurrency/performance services | Benchmark and justify first |
| Java | Enterprise integration/service workloads | Only when requirements justify runtime |
| C# | .NET ecosystem and integrations | Only when requirements justify runtime |
| HTML | Semantic page structure | Accessibility standards |
| CSS | UI styling and responsive system | Design tokens, maintainable components |
| SQL | PostgreSQL data, migrations, policies | Reviewed migration and tests |
| PHP | Optional partner/legacy integration | Isolated boundary |
| Swift | Native iOS client | Only if native mobile is required |
| Ruby | Optional legacy/specialized integration | Isolated boundary |
| C++ | Specialized native/performance component | Profiling-driven, not speculative |

The presence of a language folder or documentation does not imply a deployed runtime or production service.