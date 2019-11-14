---
title: Cassandra schema migrations on application startup
tags: ["cassandra", "schema-migration", "spring-boot", "testcontainers"]
cover: julia-craice-faCwTallTC0-unsplash.jpg
author: findinpath
---

This post shows how to setup a [spring boot](https://spring.io/projects/spring-boot)
project in order to have the Cassandra CQL schema migrations securely performed on application startup
through the help of the [cassandra-migration](https://github.com/patka/cassandra-migration)
library.

<re-img src="julia-craice-faCwTallTC0-unsplash.jpg" title="Flying colhereiros - Julia Craice on Unsplash"></re-img>

Database migrations are a topic that the software engineers have long struggled with.
After doing a `git pull` for the latest changes on the application code, it happened quite often 
that the application didn't work anymore on the local machine simply because a database 
table had to be created or altered manually on the local database.

Not that seldom production application crashes occurred during deployments due to the fact that the 
database engineer didn't run all the database scripts corresponding to the new application release. 

In order to address the before mentioned problems, in the relational database world, 
the `SQL` schema migrations have been integrated in the application code and the new 
schema migrations are executed on the database while the application is being started. 

The libraries:

- [flyway](https://flywaydb.org/)
- [liquibase](https://www.liquibase.org/)
 
are used extensively in the Java world for performing database schema migrations 
on the application startup.
As a side note, these libraries offer the possibility to dryrun and generate all the `SQL` scripts
relevant for the new productive application release into a .sql file which can be then reviewed and
executed manually by a database system administrator.

Due to the fact that Cassandra database is not a relational database, flyway doesn't offer support
for performing schema migrations on top of Cassandra.can't be
There is actually an [Github issue](https://github.com/flyway/flyway/issues/823) that dates since 
2014 on flyway, which eventually sparked the creation of the 
[cassandra-migration](https://github.com/patka/cassandra-migration) library.

This post shows how to integrate the cassandra-migration library in a spring boot application 
in order not only to perform the schema migrations on the application startup, 
but also when the test environment is being setup.

In this way, both the productive and the test code use the same database schema.   

## Separation of concerns

As already mentioned, the schema migrations are performed only during application startup phase.
This kind of database statements (`CREATE`, `ALTER`, `DROP`) are to be performed by a database
user which obviously is thought only for schema migrations purposes.

On the other hand, when thinking of security concerns for the application, the 
database user required for executing database statements required for
covering the application functionality (`SELECT`, `INSERT`, `DELETE`) should have 
more restrictive permissions. In this manner, there can be avoided catastrophic
changes on the database (`DROP` , `TRUNCATE`) that can occur through software bugs
or application attacks.

Therefor it makes very much sense to have two different Cassandra database users
in the application:

- a migration user dealing solely with `CQL` migrations on the application startup
- an application user dealing with the `CQL` queries required for offering the
functionality exposed by the application


## Spring-boot integration

The `org.springframework.boot.autoconfigure.data.cassandra.CassandraDataAutoConfiguration`
and `org.cognitor.cassandra.migration.spring.CassandraMigrationAutoConfiguration` spring boot 
auto-configuration classes are based on the presumption that only one database user
is used for both application and migration database queries.
For this reason, they need to be excluded from being taken into consideration when initializing
the spring dependency injection bean container.

```java
@SpringBootApplication(exclude = {CassandraDataAutoConfiguration.class,
    CassandraMigrationAutoConfiguration.class})
public class DemoApplication {
  //...
}
```

The project sample code provided with this post creates explicitly two different clusters:

- `applicationCluster`
- `migrationCluster`    
 

```java
@Configuration
@Profile("!test")
public class CassandraConfiguration {

  @Bean
  @CassandraMigrationCluster
  public CassandraClusterFactoryBean migrationCluster(
      @Value("${cassandra.contact.points}") String contactPoints,
      @Value("${cassandra.migration.username}") String username,
      @Value("${cassandra.migration.password}") String password) {
    PoolingOptions poolingOptions = new PoolingOptions()
        .setConnectionsPerHost(HostDistance.LOCAL, 1, 1)
        .setConnectionsPerHost(HostDistance.REMOTE, 1, 1)
        .setMaxRequestsPerConnection(HostDistance.LOCAL, 1)
        .setMaxRequestsPerConnection(HostDistance.REMOTE, 1);

    return createCassandraClusterFactoryBean(poolingOptions, contactPoints, username, password);
  }

  @Bean(name = "applicationCluster")
  public CassandraClusterFactoryBean applicationCluster(
      @Value("${cassandra.contact.points}") String contactPoints,
      @Value("${cassandra.application.username}") String username,
      @Value("${cassandra.application.password}") String password) {
    PoolingOptions poolingOptions = new PoolingOptions();
    return createCassandraClusterFactoryBean(poolingOptions, contactPoints, username, password);
  }

```

The `applicationCluster` is being used for building the `CassandraTemplate`
bean which will subsequently power all the spring data cassandra
repository classes.

```java
public class CassandraConfiguration {
  ....

  @Bean
  public CassandraSessionFactoryBean cassandraSessionFactoryBean(
      @Qualifier("applicationCluster") CassandraClusterFactoryBean applicationCluster,
      @Value("${cassandra.application.keyspaceName}") String keyspaceName) {

    Cluster cluster = applicationCluster.getObject();
    CassandraSessionFactoryBean session = new CassandraSessionFactoryBean();
    session.setCluster(cluster);
    session.setKeyspaceName(keyspaceName);
    session.setConverter(cassandraConverter());
    session.setSchemaAction(SchemaAction.NONE);

    return session;
  }

  @Bean
  public CassandraOperations cassandraTemplate(
      CassandraSessionFactoryBean cassandraSessionFactoryBean) {
    return new CassandraTemplate(cassandraSessionFactoryBean.getObject());
  }
```

The `migrationCluster` cluster on the other hand is being used only during
the application startup for performing the Cassandra schema migrations
with the help of [cassandra-migration](https://github.com/patka/cassandra-migration)
library.


```java
@Configuration
@EnableConfigurationProperties({CassandraMigrationConfigurationProperties.class})
@ConditionalOnClass({Cluster.class})
public class CassandraMigrationConfiguration extends CassandraMigrationAutoConfiguration {
  
  // ...

  @Bean(initMethod = "migrate")
  @ConditionalOnMissingBean(MigrationTask.class)
  public MigrationTask migrationTask(
      @CassandraMigrationCluster ObjectProvider<Cluster> migrationClusterProvider) {
    Cluster migrationCluster = migrationClusterProvider.getIfAvailable();
    return super.migrationTask(migrationCluster);
  }

  // ...
```


With the configurations listed above the secure integration of the 
[cassandra-migration](https://github.com/patka/cassandra-migration) library in 
the spring boot application should be almost complete.


All what is left, are the actual `CQL` migration files that come into the directory denoted by
`${cassandra.migration.scriptLocation}` environment property.


*NOTE* that each migration file should contain exactly one `CQL` statement. Therefor, in case that
an application feature needs more database changes, they must be split to different files.
Nevertheless, the naming of the migration files is pretty liberal, so the files can look like this:

- `0080_awesome_feature_create_bookmarks_table.cql`
- `0081_awesome_feature_alter_users_table.cql`


## A word about testing

It would be ideal to have a throw-away database instance which has the same schema 
as the productive database that is being made available at the
beginning of the tests .
When using [testcontainers](https://www.testcontainers.org/) library  together with 
[cassandra-migration](https://github.com/patka/cassandra-migration) 
this feat of quality assurance  engineering is easily achieved.

Below is presented a relevant snippet from the Cassandra configuration class used for test purposes:

```java
@Configuration
public class CassandraDockerConfiguration {
  // ...

  @Bean
  public CassandraContainer cassandraContainer() {
    var cassandraContainer = new CassandraContainer(CassandraContainer.IMAGE
        + CASSANDRA_DOCKER_IMAGE_VERSION);
    cassandraContainer.start();

    loadTestData(cassandraContainer);
    return cassandraContainer;
  }

  @Bean("applicationCluster")
  public CassandraClusterFactoryBean applicationCluster(CassandraContainer cassandraContainer) {
    final CassandraClusterFactoryBean cluster = new CassandraClusterFactoryBean();

    cluster.setContactPoints(cassandraContainer.getContainerIpAddress());
    cluster.setPort(cassandraContainer.getFirstMappedPort());
    return cluster;
  }

  @Bean("migrationCluster")
  @CassandraMigrationCluster
  public CassandraClusterFactoryBean migrationCluster(CassandraContainer cassandraContainer) {
    final CassandraClusterFactoryBean cluster = new CassandraClusterFactoryBean();

    cluster.setContactPoints(cassandraContainer.getContainerIpAddress());
    cluster.setPort(cassandraContainer.getFirstMappedPort());
    return cluster;
  }
  
  // ...
```

The setup of the tests is done afterwards pretty straightforward:

```java
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {"cassandra.migration.keyspaceName = demo",
    "cassandra.migration.scriptLocation: cassandra/migration"})
public class DemoTest {
  
  // ...
}
```


## Runnable sample code

The java project [cassandra-migration-spring-boot-demo](https://github.com/findinpath/cassandra-migration-spring-boot-demo)
provides a runnable example on how to perform the separation of concerns between the Cassandra 
application and migration users. The project also makes use of [testcontainers](https://www.testcontainers.org/)
library allowing therefor the repository tests to be executed against a real (and not embedded) Cassandra
database.

Simply use `mvn clean install` for trying out the project.
