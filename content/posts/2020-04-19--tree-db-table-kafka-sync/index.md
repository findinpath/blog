---
title: Sync tree databse table over Apache Kafka
tags: ["kafka-connect-jdbc","kafka","testcontainers", "postgresql"]
cover: johann-siemens-unsplash.png
author: findinpath
---


Showcase on how to *eventually* sync hierachical data
from a source database table towards a sink database table via Apache Kafka in a
untainted fashion without intermittently having corrupt content on the sink
database table.

## Nested Set Model

There are multiple ways of storing and reading hierarchies in a relational database:

- adjacency list model: each tuple has a parent id pointing to its parent
- nested set model: each tuple has `left` and `right` coordinates corresponding to the preordered representation of the tree

Details about the advantages of the nested set model are already very well described in
the following article:

https://www.sitepoint.com/hierarchical-data-database/


**TLDR** As mentioned on [Wikipedia](https://en.wikipedia.org/wiki/Nested_set_model)

> The nested set model is a technique for representing nested sets
> (also known as trees or hierarchies) in relational databases.


<re-img src="nested-set-tree.png"></re-img>

<re-img src="nested-set-model.png"></re-img>



## Syncing nested set models over Apache Kafka

[Kafka Connect](https://docs.confluent.io/current/connect/index.html)
is an open source component of [Apache Kafka](http://kafka.apache.org/) which
in a nutshell, as described on [Confluent blog](https://www.confluent.io/blog/kafka-connect-deep-dive-jdbc-source-connector/)
provides the following functionality for databases:

> It enables you to pull data (source) from a database into Kafka, and to push data (sink) from a Kafka topic to a database.


More details about kafka-connect-jdbc connector can be found on the
[Conflent documentation](https://docs.confluent.io/current/connect/kafka-connect-jdbc/index.html).

<re-img src="JDBC-connector.png"></re-img>

Syncing of nested set model from the source database to Apache Kafka
can be easily taken care of by a kafka-connect-jdbc source connector
which can be initialized by posting the following configuration
to the `/connectors` endpoint of
Kafka Connect (see [Kafka Connect REST interface](https://docs.confluent.io/current/connect/references/restapi.html#post--connectors))

```json
{
    "name": "findinpath",
    "config": {
        "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
        "mode": "timestamp+incrementing",
        "timestamp.column.name": "updated",
        "incrementing.column.name": "id",
        "topic.prefix": "findinpath.",
        "connection.user": "sa",
        "connection.password": "p@ssw0rd!source",
        "validate.non.null": "false",
        "tasks.max": "1",
        "name": "findinpath",
        "connection.url": "jdbc:postgresql://source:5432/source?loggerLevel=OFF",
        "table.whitelist": "nested_set_node"
    }
}
```

**NOTE** in the configuration above, the `tasks.max` is set to `1` because JDBC source connectors can deal
only with one `SELECT` statement at a time for retrieving the updates performed on a table.
It is advisable to use also for Apache Kafka a topic with only `1` partition for syncing the nested set content
towards downstream services.

### Refresh the nested set model on the sink database

On the sink database side there needs to be implemented a mechanism that contains
a safeguard for not adding invalid updates to the nested set model.
A concrete example in this direction is when going from the nested set model:

```generic
|1| A |2|
```

to the nested set model (after adding two children)

```generic
|1| A |6|
    ├── |2| B |3|
    └── |4| C |5|
```

In the snippets above the tree node labels are prefixed by their `left` and `right`
nested set model coordinates.

Via `kafka-connect-jdbc` the records corresponding to the tuple updates may come in various
ordering:

```generic
| label | left | right |
|-------|------|-------|
| A     | 1    | 6     |
| B     | 2    | 3     |
| C     | 4    | 5     |
```

or

```generic
| label | left | right |
|-------|------|-------|
| B     | 2    | 3     |
| C     | 4    | 5     |
| A     | 1    | 6     |
```

or any other combinations of the three tuples listed above because the records
are polled in batches of different sizes from Apache Kafka.


Going from the nested set model table content

```generic
| label | left | right |
|-------|------|-------|
| A     | 1    | 2     |
```

towards

```textmate
| label | left | right |
|-------|------|-------|
| A     | 1    | 6     |
```
or

```generic
| label | left | right |
|-------|------|-------|
| A     | 1    | 6     |
| B     | 2    | 3     |
```

would intermittently render the nested set model corrupt until
all the records from the source nested set model are synced over Apache Kafka.

Using a kafka-connect-jdbc sink connector is therefor out of the question for
syncing the contents of trees from a source service towards downstream online services.

One solution to cope with such a problem would be to separate the nested set model from
what is being synced over Apache Kafka.


<re-img src="sink-database-table-diagram.png"></re-img>


In the table diagram above, the `nested_set_node_log` table is an `INSERT only` table
in which is written whenever a new record(s) is read from Apache Kafka.
The `log_offset` table has only one tuple pointing to the last `nested_set_node_log` tuple id
processed when updating the `nested_set_node` table.

Whenever new records are read from Apache Kafka, there will be a transactional attempt
to apply all the updates from `nested_set_node_log` made after the saved entry in the `log_offset`
table to the existing configuration of the `nested_set_node` nested set model.

If the applied updates lead to a valid nested set model configuration, then the `nested_set_node`
table will be updated and the log offset will be set to the latest processed `nested_set_node_log` entry,
otherwise the `nested_set_node` table stays in its previous state.

## Caching

On the sink side is implemented the [Guava's Cache](https://github.com/google/guava/wiki/CachesExplained)
for avoiding to read each time from the persistence the contents of the nested set model.
This approach nears the usage on a productive system, where the contents of the nested set model
are cached and not read from the database for each usage.

When there are new contents added to the nested set model, the cache is notified for
invalidating its contents.

## JDBC Transactions

One of the challenges faced before implementing this proof of concept
was whether to use [spring framework](https://spring.io/) to wrap the
complexities of dealing with JDBC. It is extremely appealing to use
production ready frameworks and not care about their implementation complexity.

The decision made in the implementation was to avoid using `spring` and
`JPA` and go with plain old `JDBC`.

Along the way in the implementation, one open question was whether to group
all the JDBC complexity in one repository or in multiple repositories.
Due to the fact that multiple repositories bring a better overview in the
maintenance, the decision was made to go with multiple repositories.

There were some scenarios which involved transaction handling over multiple
DAO objects. The possible ways of handling transactions over multiple repositories is very
well described in the stackexchange post:

https://softwareengineering.stackexchange.com/a/339458/363485

The solution used to cope with this situation within this proof of concept was to create
repositories for each service operation and inject  the connection in the repositories.

> Dependency injection of connection: Your DAOs are not singletons but throw-away objects, receiving the connection on creation time. The calling code will control the connection creation for you.
>
> PRO: easy to implement
>
> CON: DB connection preparation / error handling in the business layer
>
> CON: DAOs are not singletons and you produce a lot of trash on the heap (your implementation language may vary here)
>
> CON: Will not allow stacking of service methods


## Testing

It is relatively easy to think about a solution for the previously exposed problem, but before putting it to a production
environment the solution needs propper testing in conditions similar to the environment in which it will run.

This is where the [testcontainers](https://www.testcontainers.org/) library helps a great deal by providing lightweight,
throwaway instances of common databases that can run in a Docker container.

More details on how to perform integration tests involving kafka-connect-jdbc  can be found on the blog post:

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Showcase of testing syncing of <a href="https://twitter.com/hashtag/postgres?src=hash&amp;ref_src=twsrc%5Etfw">#postgres</a> <br>data via <a href="https://twitter.com/confluentinc?ref_src=twsrc%5Etfw">@confluentinc</a> kafka-connect-jdbc towards <a href="https://twitter.com/apachekafka?ref_src=twsrc%5Etfw">@apachekafka</a> with <a href="https://twitter.com/testcontainers?ref_src=twsrc%5Etfw">@testcontainers</a><a href="https://t.co/HdwH12neDW">https://t.co/HdwH12neDW</a></p>&mdash; findinpath (@findinpath) <a href="https://twitter.com/findinpath/status/1248517825297362945?ref_src=twsrc%5Etfw">April 10, 2020</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>


<re-img src="nested-set-kafka-sync-system-tests.png"></re-img>

Docker containers are used for interacting with the Apache Kafka ecosystem as well as the source and sink databases.

This leads to tests that are easy to read and allow the testing of the sync operation for various nested set models

```java
    /**
     *   Ensure that the sync the content of a more complex nested set model
     *   is performed successively each time after performing updates on the
     *   nested set model on the source database.
     */
    @Test
    public void syncingSuccessiveChangesToTheTreeDemo() {

        var clothingNodeId = sourceNestedSetService.insertRootNode("Clothing");
        awaitForTheSyncOfTheNode(clothingNodeId);
        logSinkTreeContent();

        // The current structure of the tree should be:
        // |1| Clothing |2|


        // Add now Men's and Women's children and wait for the syncing
        var mensNodeId = sourceNestedSetService.insertNode("Men's", clothingNodeId);
        var womensNodeId = sourceNestedSetService.insertNode("Women's", clothingNodeId);

        awaitForTheSyncOfTheNode(womensNodeId);
        logSinkTreeContent();

        // The current structure of the tree should be:
        // |1| Clothing |6|
        //     ├── |2| Men's |3|
        //     └── |4| Women's |5|



        // Add new children categories for both Men's and Women's nodes
        sourceNestedSetService.insertNode("Suits", mensNodeId);
        sourceNestedSetService.insertNode("Dresses", womensNodeId);
        sourceNestedSetService.insertNode("Skirts", womensNodeId);
        sourceNestedSetService.insertNode("Blouses", womensNodeId);

        awaitForTheSyncOfTheNode(womensNodeId);
        logSinkTreeContent();
        // The current structure of the tree should be:
        //   |1| Clothing |14|
        //       ├── |2| Men's |5|
        //       │       └── |3| Suits |4|
        //       └── |6| Women's |13|
        //               ├── |7| Dresses |8|
        //               ├── |9| Skirts |10|
        //               └── |11| Blouses |12|
    }
```

See [DemoNestedSetSyncTest](https://github.com/findinpath/nested-set-kafka-sync/blob/master/end-to-end-tests/src/test/java/com/findinpath/DemoNestedSetSyncTest.java)
for several syncing test cases.

This project provides a functional prototype on how to setup the whole
Confluent environment (including **Confluent Schema Registry** and **Apache Kafka Connect**)
via testcontainers.

See [AbstractNestedSetSyncTest](https://github.com/findinpath/nested-set-kafka-sync/blob/master/end-to-end-tests/src/test/java/com/findinpath/AbstractNestedSetSyncTest.java)
and the [testcontainers package](https://github.com/findinpath/nested-set-kafka-sync/tree/master/end-to-end-tests/src/test/java/com/findinpath/testcontainers) for details.

### Kafka Connect

In order to use the Confluent's Kafka Connect container, this project made use of the already existing code
for [KafkaConnectContainer](https://github.com/ydespreaux/testcontainers/blob/master/testcontainers-kafka/src/main/java/com/github/ydespreaux/testcontainers/kafka/containers/KafkaConnectContainer.java)
on [ydespreaux](https://github.com/ydespreaux) Github account.

**NOTE** that the `KafkaConnectContainer` class previously mentioned has also corresponding test cases
within the project [lib-kafka-connect](https://github.com/ydespreaux/shared/tree/master/lib-kafka-connect) in order to have a clue
on how to interact in an integration test with the container.


## Sample code

Checkout the github project sample project [nested-set-kafka-sync](https://github.com/findinpath/nested-set-kafka-sync) and try out the tests via

```bash
mvn clean test
```

