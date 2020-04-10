---
title: kafka-connect-jdbc testcontainers tests
tags: ["testcontainers", "postgresql","kafka-connect-jdbc","kafka"]
cover: unsplash-john-towner-la-defense.png
author: findinpath
---


Test a system that depends on kafka-connect-jdbc by bootstrapping
the Apache Kafka ecosystem artifacts and PostgreSQL through [testcontainers](https://www.testcontainers.org/).

In a nutshell, as described on
[Confluent blog](https://www.confluent.io/blog/kafka-connect-deep-dive-jdbc-source-connector/)
the [kafka-connect-jdbc](https://docs.confluent.io/current/connect/kafka-connect-jdbc/index.html)
provides the following functionality:


>  It enables you to pull data (source) from a database into Kafka, and to push data (sink) from a Kafka topic to a database.


<re-img src="JDBC-connector.png"></re-img>

This post is a showcase on how to test the synchronization of the contents
of a [PostgreSQL](https://www.postgresql.org/) table
via [kafka-connect-jdbc](https://docs.confluent.io/current/connect/kafka-connect-jdbc/index.html)
towards [Apache Kafka](https://kafka.apache.org/).

The contents of the input PostgreSQL table are synced as [AVRO](https://avro.apache.org/) messages
towards Apache Kafka.

The showcased project [testcontainers-kafka-connect](https://github.com/findinpath/testcontainers-kafka-connect/)
makes use of [docker](https://www.docker.com/) containers
(via [testcontainers](https://www.testcontainers.org/) library) for showcasing
the Confluent Kakfa Connect functionality in an automated test case.


The interactions from this proof of concept are described visually in the image below:

<re-img src="kafka-connect-jdbc_system-test_architecture.png"></re-img>

The proof of concept [testcontainers-kafka-connect](https://github.com/findinpath/testcontainers-kafka-connect/)
project can be used for making end to end system test cases with
[docker](https://www.docker.com/) for architectures that rely on
[kafka-connect-jdbc](https://docs.confluent.io/current/connect/kafka-connect-jdbc/index.html)
for syncing content from a relational database (PostgreSQL is the database used in the
aforementioned project).


The [testcontainers](https://www.testcontainers.org/) library already
offers a [Kafka](https://www.testcontainers.org/modules/kafka/) module
for interacting with [Apache Kafka](https://kafka.apache.org/), but
there is not, at the moment, a testcontainers module for the whole
Confluent environment (Confluent Schema Registry / Apache Kafka Connect
container support is missing from the module previously mentioned).

The project [testcontainers-kafka-connect](https://github.com/findinpath/testcontainers-kafka-connect/)
contains custom implementations for [testcontainers](https://www.testcontainers.org/) extensions
corresponding for:

- Apache Zookeeper
- Apache Kafka
- Confluent Schema Registry
- Apache Kafka Connect

that can be used to reproduce a multi-container scenario that involves working with the
aforementioned components of the Apache Kafka ecosystem.

As a side note, the containers used do not use the default ports exposed
by default in the artifacts (e.g. : Apache Zookeeper _2181_, Apache Kafka _9092_,
Confluent Schema Registry _8081_, Apache Kafka Connect _8083_), but rather free
ports available on the test machine avoiding therefor possible conflicts
with already running services on the test machine.

For the test environment the following containers will be started:

- Apache Zookeeper
- Apache Kafka
- Confluent Schema Registry
- Confluent Kafka Connect
- PostgreSQL

It is quite impressive to see how close a productive environment can be simulated in the test cases
with the [testcontainers](https://www.testcontainers.org/) library.


## Demo test

Once the test environment is started, via a HTTP call performed with [rest-assured](http://rest-assured.io/)
a kafka-connect-jdbc connector will be registered for the `bookmarks` PostgreSQL table.

The kafka-connect-jdbc connector will afterwards then continously poll the `bookmarks` table
and will sync its contents towards the `findinpath.bookmarks` Apache Kafka topic.

The demo verifies whether the dynamically inserted contents
into the `bookmarks` Postgres table get successfully synced in
[AVRO](http://avro.apache.org/) format on the Apache Kafka
topic `findinpath.bookmarks` in the same order as they were inserted.

## Sample code

Checkout the github project sample project [testcontainers-kafka-connect](https://github.com/findinpath/testcontainers-kafka-connect) and try out the tests via

```bash
mvn clean test
```
