---
title: Exchange Kafka avro messages in testcontainers ecosystem
tags: ["testcontainers", "kafka", "avro"]
cover: richard-r-schunemann-EIeQUi77QGg-unsplash.jpg
author: findinpath
---

This post showcases a manner on which to ensure the quality of [Apache Kafka](https://kafka.apache.org/)
producers & consumers that exchange [avro](https://avro.apache.org/) messages in a dockerized environment.

<re-img src="richard-r-schunemann-EIeQUi77QGg-unsplash.jpg" title="Avro Aircrafts - Photo by Richard R Schünemann on Unsplash"></re-img>


The library [testcontainers](https://www.testcontainers.org/) can be used for providing lightweight,
throw-away instances of [docker](https://www.docker.com/) containers corresponding to the 
artifacts of the Apache Kafka ecosystem:

- Apache Zookeeper
- Apache Kafka
- Confluent Schema Registry

In this fashion, there can be tested complex integration scenarios which would
otherwise involve the presence of an actual Apache Kafka testing environment.
Simulating, for example, a schema version update for an avro event transported 
over Apache Kafka, can be tested therefor safely in an integration test
without needing to occasionally manually test this operation. 

The testcontainers library already offers a [Kafka](https://www.testcontainers.org/modules/kafka/) module 
for interacting with Apache Kafka, but there is not, at the moment, support on it for a
[Confluent Schema Registry](https://www.confluent.io/confluent-schema-registry/) container. 

The project [testcontainers-kafka-avro](https://github.com/findinpath/testcontainers-kafka-avro)
is a working prototype on how to setup and use in unit tests all the containers 
corresponding to the artifacts of the Apache Kafka ecosystem.


Setting up of the containers is done in the following manner:

```java
  @BeforeAll
  public static void confluentSetup() throws Exception {
    network = Network.newNetwork();
    zookeeperContainer = new ZookeeperContainer()
        .withNetwork(network);
    kafkaContainer = new KafkaContainer(zookeeperContainer.getZookeeperConnect())
        .withNetwork(network);
    schemaRegistryContainer = new SchemaRegistryContainer(zookeeperContainer.getZookeeperConnect())
        .withNetwork(network);

    Runtime.getRuntime()
        .addShutdownHook(new Thread(() ->
                Arrays.asList(zookeeperContainer, kafkaContainer, schemaRegistryContainer)
                    .parallelStream().forEach(GenericContainer::stop)
            )
        );

    Stream.of(zookeeperContainer, kafkaContainer, schemaRegistryContainer).parallel()
        .forEach(GenericContainer::start);

    // ...
  }
```

The beauty of working with the testcontainers library is that there (considering that docker
installed on the test machine) is nothing related to Apache Kafka to be installed on the test
machine. Simply by running `mvn clean install` everything is being automatically setup on
docker and at the end of the test, the containers needed by it will be disposed.


As a side note, the containers used do not use the default ports exposed by default in 
their corresponding artifacts (e.g. : Apache Zookeeper `2181`, Apache Kafka `9092`, 
Confluent Schema Registry `8081`), but rather free ports available on the test/build 
machine. In this fashion there are avoided possible conflicts with already running 
services on the test/build machine.

The creation of the Apache Kafka topic needed in the test, as well as the registration of 
the avro types in the Confluent Schema Registry is done once 
while setting up the Confluent environment.

The 
[test](https://github.com/findinpath/testcontainers-kafka-avro/blob/master/src/test/java/com/findinpath/AvroDemoTest.java) 
showcased in the project shows how a Kafka Producer writes a `BookmarkEvent` 
avro event to the `BookmarkEvents` topic from which a Kafka Consumer reads it 
and verifies that the message received is the same as the message sent.

```java
  @Test
  public void demo() {
    final UUID userUuid = UUID.randomUUID();
    final BookmarkEvent bookmarkEvent = new BookmarkEvent(userUuid.toString(), URL,
        Instant.now().toEpochMilli());

    produce(TOPIC, bookmarkEvent);
    LOGGER.info(
        String.format("Successfully sent 1 BookmarkEvent message to the topic called %s", TOPIC));

    var consumerRecords = dumpTopic(TOPIC, 1, POLL_TIMEOUT_MS);
    LOGGER.info(String.format("Retrieved %d consumer records from the topic %s",
        consumerRecords.size(), TOPIC));

    assertThat(consumerRecords.size(), equalTo(1));
    assertThat(consumerRecords.get(0).key(), equalTo(bookmarkEvent.getUserUuid()));
    assertThat(consumerRecords.get(0).value(), equalTo(bookmarkEvent));
  }
``` 

Even though this demo showcases a rather naive usecase, the setup shown above for
Apache Kafka ecosystem can be used for complex quality assurance scenarios like:

- simulating how are handled by the producer/consumer the schema version updates of the
avro messages
- investigate how the consumer/producer functions when the schema registry is temporarily 
not available (when pausing the schema registry docker container)

Feel free to integrate the Apache Kafka ecosystem 
[testcontainers classes](https://github.com/findinpath/testcontainers-kafka-avro/tree/master/src/test/java/com/findinpath/testcontainers)
in your project to ensure the accuracy of your Apache Kafka avro producers & consumers.

