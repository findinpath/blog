---
title: JDBC Nested Set Sink Connector
tags: ["kafka-connect","kafka","testcontainers"]
cover: chris-leipelt-LHnJL3D50vc-unsplash.png
author: findinpath
---


Demo showcase of JDBC Nested Set Sink Connector for Apache Kafka Connect used to *eventually* sync
hierachical data (e.g. : shop category tree) from Apache Kafka towards a sink database table
via Apache Kafka Connect in an untainted fashion without intermittently having corrupt content on the sink
database destination nested set model table.


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

<re-img src="kafka-connect.png"></re-img>

The topic of synchronizing nested set model data between databases has been already discussed in the blog post :

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Ever wondered how to sync trees or hierarchies over <a href="https://twitter.com/apachekafka?ref_src=twsrc%5Etfw">@apachekafka</a> by making use of <a href="https://twitter.com/confluentinc?ref_src=twsrc%5Etfw">@confluentinc</a> kafka-connect-jdbc ? <a href="https://t.co/p85iH3a6Yu">https://t.co/p85iH3a6Yu</a></p>&mdash; findinpath (@findinpath) <a href="https://twitter.com/findinpath/status/1251752936692203521?ref_src=twsrc%5Etfw">April 19, 2020</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>


In the previous blog post the nested set model data published over
[kafka-connect-jdbc source connector](https://docs.confluent.io/current/connect/kafka-connect-jdbc/source-connector/index.html)
from the source database to Apache Kafka was being handled explicitly in the business logic of the sink microservice application.

It is definitely possible to integrate the synchronization logic for the nested set data explicitly in a
microservice that depends on the nested set model data (e.g. : shop category tree), but this adds, possibly unwanted,
further complexity to the microservice.

The synchronization functionality for the nested set model data which is a non-core functionality of
the microservice needs to be maintained and monitored.

Another possibility would be to delegate the responsibility of syncing the nested set model data to a JDBC Sink Connector
from the [Confluent Hub](https://www.confluent.io/hub/). This approach would have the advantage that the microservice consuming
the nested set model data would solely concentrate on its core functionality.

This post describes how to use the [JDBC Nested Set Sink Connector](https://github.com/findinpath/kafka-connect-nested-set-jdbc-sink)
created to generically sink nested set model data via Apache Kafka Connect in a destination nested set model table.


## End to end synchronization over Apache Kafka Connect

Syncing of nested set model from the **source database** to Apache Kafka
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


Syncing of the nested set model data from Apache Kafka towards the **sink database**
can be now easily taken care of by the **JDBC Nested Set Sink Connector**:

```json
{
    "name": "jdbc-nested-set-node-sink",
    "config": {
        "name": "jdbc-nested-set-node-sink",
        "connector.class": "com.findinpath.connect.nestedset.jdbc.NestedSetJdbcSinkConnector",
        "tasks.max": "1",
        "topics": "findinpath.nested_set_node",
        "connection.url": "jdbc:postgresql://sink:5432/postgres",
        "connection.user": "sa",
        "connection.password": "p@ssw0rd!sink",
        "pk.fields": "id",
        "table.name": "nested_set_node",
        "table.left.column.name": "lft",
        "table.rgt.column.name": "rgt",
        "log.table.name": "nested_set_node_log",
        "log.table.primary.key.column.name": "log_id",
        "log.table.operation.type.column.name": "operation_type",
        "log.offset.table.name": "nested_set_node_log_offset",
        "log.offset.table.log.table.column.name": "log_table_name",
        "log.offset.table.offset.column.name": "log_table_offset"
    }
}
```

## Functionality overview

The _JDBC Nested Set Sink Connector_ is relatively similar in functionality to the [JDBC Sink Connector for Confluent Platform](https://docs.confluent.io/current/connect/kafka-connect-jdbc/sink-connector/index.html)
because it ingests [SinkRecord](https://github.com/apache/kafka/blob/trunk/connect/api/src/main/java/org/apache/kafka/connect/sink/SinkRecord.java) entries and writes
them in a database table. This is also the reason why this connector made use of a great part of the sink logic of the [kafka-connect-jdbc](https://github.com/confluentinc/kafka-connect-jdbc) project
code.


The _JDBC Nested Set Sink Connector_ writes the sink records in a database table structure similar to the one shown below:

<re-img src="sink-database-table-diagram.png"></re-img>


The **nested\_set\_node_log** table is an **INSERT only** table which simulates a certain extent the transaction logs
on the nested set model data.

After writing new entries on the **nested\_set\_node\_log**  table, there will be an attempt to synchronize them towards
the destination **nested\_set\_node** table. This operation will succeed only when the nested set model resulting from the
merge of:

- existing content from the **nested\_set\_node** table
- new **nested\_set\_node_log** table entries

is valid.

The table **nested\_set\_node\_log\_offset** will contain only a pointer towards the ID of the latest **nested\_set\_node_log** entry
synchronized successfully into the **nested\_set\_node** table.


**NOTE**: The microservice that makes use of the nested set model tree content should continuously poll the table **nested\_set\_node\_log\_offset**
in order to know when the nested set model has been updated.

At the time of this writing the connector supports and has been tested with the following databases:

- Postgres 12
- MySQL 8
- MS SQL Server 2017
- sqlite 3
- Oracle 18.4.0 XE


The _JDBC Nested Set Sink Connector_ supports both:

- [upsert](https://github.com/findinpath/kafka-connect-nested-set-jdbc-sink/blob/master/TESTING_UPSERT.md): the position of the node in the tree or its data can be upserted (updated/inserted)
- [deletion](https://github.com/findinpath/kafka-connect-nested-set-jdbc-sink/blob/master/TESTING_DELETE.md): the node can be removed from the tree (works with [Debezium](https://debezium.io/) change data capture Kafka Connect source connector)

operations on the nested set model entries.



## Testing

It is relatively easy to think about a solution for the previously exposed problem, but before putting it to a production
environment the solution needs proper testing in conditions similar to the environment in which it will run.

This is where the [testcontainers](https://www.testcontainers.org/) library helps a great deal by providing lightweight,
throwaway instances of common databases that can run in a Docker container.


<re-img src="end-to-end-test-architecture-diagram.png"></re-img>

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

        long clothingNodeId = sourceNestedSetService.insertRootNode("Clothing");
        awaitForTheSyncOfTheNode(clothingNodeId);
        logSinkTreeContent();

        // The current structure of the tree should be:
        // |1| Clothing |2|


        // Add now Men's and Women's children and wait for the syncing
        long mensNodeId = sourceNestedSetService.insertNode("Men's", clothingNodeId);
        long womensNodeId = sourceNestedSetService.insertNode("Women's", clothingNodeId);

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

See [DemoNestedSetSyncTest](https://github.com/findinpath/kafka-connect-nested-set-jdbc-sink/blob/master/src/test/java/com/findinpath/connect/nestedset/jdbc/DemoNestedSetSyncTest.java)
for several syncing test cases.

This project provides a functional prototype on how to setup the whole
Confluent environment (including **Confluent Schema Registry** and **Apache Kafka Connect**)
via testcontainers.

See [AbstractNestedSetSyncTest](https://github.com/findinpath/kafka-connect-nested-set-jdbc-sink/blob/master/src/test/java/com/findinpath/connect/nestedset/jdbc/AbstractNestedSetSyncTest.java)
for details.


## Source code

Checkout the github project [kafka-connect-nested-set-jdbc-sink](https://github.com/findinpath/kafka-connect-nested-set-jdbc-sink/).

At the time of this writing, this plugin is not available via Confluent Hub. This is why a manual install is needed.

Check out the [Installation notes](https://github.com/findinpath/kafka-connect-nested-set-jdbc-sink/#installation-notes) for details
on how to install the JDBC Nested Set Sink Connector locally on your Apache Kafka ecosystem.

Try out the tests via

```bash
mvn clean test
```

