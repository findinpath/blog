---
title: Dynamic property sources for PostgreSQL spring boot tests
tags: ["testcontainers", "postgresql","spring-boot"]
cover: unsplash-sergio-souza-containers.png
author: findinpath
---


Make use of the newly introduced
DynamicPropertySource spring annotation
in configuring DataSource spring beans required in the tests
that make use of [testcontainers](https://www.testcontainers.org/).

Spring Boot interacts with databases via with data sources
mapped via the `spring.datasource` in the `application.yml` file.
In the Spring Boot internals, via
`org.springframework.boot.autoconfigure.jdbc.DataSourceInitializationConfiguration`, is triggered
the creation of the much needed spring bean instance of type `javax.sql.DataSource` for JDBC/JPA interactions.

In the context of testing DAO (Data Access Object) classes, it is very common to make use of
the [testcontainers](https://www.testcontainers.org/) library.


> Testcontainers is a Java library that supports JUnit tests, providing lightweight, throwaway instances of common databases


Before introducing the annotation `@DynamicPropertySource` there was needed an
implementation of the `ApplicationContextInitializer` to introduce dynamicaly the required properties in
the configurable application context for bootstrapping the creation of the data source backed (via
[testcontainers](https://www.testcontainers.org/)  library) by a database living in a [docker](https://www.docker.com/) container :

```java
@SpringJUnitConfig(classes = {Application.class}, initializers = {PostgresIntegrationTest.Initializer.class})
@Testcontainers
public class PostgresIntegrationTest {

  @Container
  public static PostgreSQLContainer postgreSQLContainer = new PostgreSQLContainer("postgres:12")
      .withDatabaseName("integration-tests-db")
      .withUsername("sa")
      .withPassword("sa");


  @Autowired
  private JdbcTemplate jdbcTemplate;

  static class Initializer implements ApplicationContextInitializer<ConfigurableApplicationContext> {
    public void initialize(ConfigurableApplicationContext configurableApplicationContext) {
      TestPropertyValues.of(
          "spring.datasource.url=" + postgreSQLContainer.getJdbcUrl(),
          "spring.datasource.username=" + postgreSQLContainer.getUsername(),
          "spring.datasource.password=" + postgreSQLContainer.getPassword()
      ).applyTo(configurableApplicationContext.getEnvironment());
    }
  }

  @Test
  public void demo(){
     jdbcTemplate.execute("SELECT 1");
  }
}
```

With the introduction of the `@DynamicPropertySource` there is no need for an extra `ApplicationContextInitializer`:

```java
@SpringJUnitConfig(classes = {Application.class})
@Testcontainers
public class PostgresIntegrationTest {

  @Container
  public static PostgreSQLContainer postgreSQLContainer = new PostgreSQLContainer("postgres:12")
      .withDatabaseName("integration-tests-db")
      .withUsername("sa")
      .withPassword("sa");


  @Autowired
  private JdbcTemplate jdbcTemplate;

  @DynamicPropertySource
  static void postgresProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgreSQLContainer::getJdbcUrl);
    registry.add("spring.datasource.username", postgreSQLContainer::getUsername);
    registry.add("spring.datasource.password", postgreSQLContainer::getPassword);
  }

  @Test
  public void demo() {
    jdbcTemplate.execute("SELECT 1");
  }
}
```

As can be seen from above, the newly introduced `@DynamicPropertySource` is somehow similar to the
commonly used `@TestPropertySource` annotation with the mention that it allows the usage of dynamic resources
such as the IP and port assigned to the container (needed in the `jdbcUrl` in the example above).

Check out the full source code (and corresponding documentation) of the
<a target="_blank" href="https://github.com/findinpath/postgres-spring-boot-dynamicpropertysource/blob/master/src/test/java/com/findinpath/springboot/testcontainers/PostgresIntegrationTest.java">PostgresIntegrationTest.java</a>
class.


See more details about the usage of the `@DynamicPropertyResource` in the Spring framework
<a target="_blank" href="https://docs.spring.io/spring-framework/docs/current/spring-framework-reference/testing.html#testcontext-ctx-management-dynamic-property-sources">documentation</a>.




## Sample code

Checkout the github project sample project [postgres-spring-boot-dynamicpropertysource](https://github.com/findinpath/postgres-spring-boot-dynamicpropertysource/) and try out the tests via

```bash
mvn clean test
```
