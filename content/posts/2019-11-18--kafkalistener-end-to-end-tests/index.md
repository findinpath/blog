---
title: End to end tests for KafkaListener
tags: ["spring-kafka", "end-to-end-testing", "testcontainers"]
cover: photo-1508700115892-45ecd05ae2ad.jpeg
author: findinpath
---

This post shows how the 
[KafkaListener](https://docs.spring.io/spring-kafka/api/org/springframework/kafka/annotation/KafkaListener.html)
belonging to the [spring-kafka](https://spring.io/projects/spring-kafka) library can
be tested in an end-to-end fashion for both json and avro mesages.

<re-img src="apache-kafka.png"></re-img>



The [spring-kafka](https://spring.io/projects/spring-kafka) comes with a few testing 
utilities, but it doesn't provide any utilities for testing the methods
annotated with the [KafkaListener](https://docs.spring.io/spring-kafka/api/org/springframework/kafka/annotation/KafkaListener.html)
annotation. Moreover, it makes use of an embedded Apache Kafka broker, instead of
dockerized Apache Kafka container image artifacts. 

This post concentrates on the concepts implemented in the project [kafkalistener-e2e-test](https://github.com/findinpath/kafkalistener-e2e-test) for dealing with end-to-end-testing for the methods annotated with the
[KafkaListener](https://docs.spring.io/spring-kafka/api/org/springframework/kafka/annotation/KafkaListener.html) annotation.


The [testcontainers](https://www.testcontainers.org/) library
is employed for spawning before the tests a complete [Confluent](https://www.confluent.io/) ecosystem
of [docker](https://www.docker.com/) container images for artifacts related to Apache Kafka:

- Apache Kafka
- Apache Zookeeper
- Confluent Schema Registry

By using versions for the container images that correspond to the Apache Kafka
ecosystem from the production environment, there is simulated an environment 
which is very close to the one running in the  production. 
This particularity gives a high relevance to the integration/ end-to-end tests
for the kafka listener functionality.  


It is very important to have the ability to perform end-to-end tests in a throwaway 
dockerized environment because there can be executed with a high certainty common 
scenarios that the kafka listener service is supposed to handle as part of its contract.


## End to End Test setup

As mentioned previously, by employing the [testcontainers](https://www.testcontainers.org/) library
an entire Apache Kafka ecosystem will be spawned at the beginning of the tests.
Check out the implementation related to testcontainers in the project [kafkalistener-e2e-test](https://github.com/findinpath/kafkalistener-e2e-test/tree/master/src/test/java/com/findinpath/kafka/testcontainers)
for seeing how the Apache Kafka ecosystem artifacts are configured to work together
for setting up the testing enviroment for the end to end tests. 

```java
//KafkaTestContainers.java

public KafkaTestContainers() throws IOException {
  this.network = Network.newNetwork();
  this.zookeeperContainer = new ZookeeperContainer()
      .withNetwork(network);
  this.kafkaContainer = new KafkaContainer(zookeeperContainer.getZookeeperConnect())
      .withNetwork(network);
  this.schemaRegistryContainer = new SchemaRegistryContainer(
      zookeeperContainer.getZookeeperConnect())
      .withNetwork(network);

  Startables
      .deepStart(Stream.of(zookeeperContainer, kafkaContainer, schemaRegistryContainer))
      .join();

}
```

Once the Apache Kafka ecosystem is up and running, the topics necessary for the end-to-end
tests are created and the [AVRO](https://avro.apache.org/) types are registered 
to Confluent Schema Registry docker container. 

```java
// KafkaDockerConfiguration.java

@Bean
public KafkaTestContainers kafkaTestContainers(
    @Value("${kafka.userBookmarkEventsJson.topic}") String userBookmarkEventJsonTopic,
    @Value("${kafka.userBookmarkEventsAvro.topic}") String userBookmarkEventAvroTopic
) throws Exception {
  var kafkaTestContainers = new KafkaTestContainers();

  createTopics(kafkaTestContainers, userBookmarkEventJsonTopic, userBookmarkEventAvroTopic);
  registerSchemaRegistryTypes(kafkaTestContainers.getSchemaRegistryContainer());
  return kafkaTestContainers;
}
```

After this setup, the rest of the spring beans from Spring's dependency
injection container (including the kafka listeners) are initialized and at this time
there can be executed end-to-end tests.

```java
// UserBookmarkEventJsonListenerTest.java

@MockBean
private UserBookmarkEventService userBookmarkEventService;

@Test
public void demo() {
  // GIVEN
  var userId = UUID.randomUUID().toString();
  var url = "https://findinpath.com";
  UserBookmarkEvent userBookmarkEvent = new UserBookmarkEvent(userId, url,
      Instant.now().toEpochMilli());

  // WHEN
  writeToTopic(userBookmarkEventJsonTopic, userBookmarkEvent);

  // THEN
  var argumentCaptor = ArgumentCaptor.forClass(UserBookmarkEvent.class);
  verify(userBookmarkEventService, timeout(10_000)).ingest(argumentCaptor.capture());
  UserBookmarkEvent capturedUserBookmarkEvent = argumentCaptor.getValue();
  assertThat(userBookmarkEvent, equalTo(capturedUserBookmarkEvent));
}
```

The demo test is quite straightforward, because it only concentrates to make sure that the service
responsible of the business logic of handling the message is being called.
Nevertheless, such a test ensures that the correct service is being called in the kafka listener
and also that the message sent to the kafka topic is correctly deserialized. 


## Limitations

Compared to the tests in which the tests in which the 
[KafkaConsumer](https://kafka.apache.org/23/javadoc/index.html?org/apache/kafka/clients/consumer/KafkaConsumer.html)
can be manipulated directly in order to be able to reset the consumer offset
after each test, [spring-kafka](https://spring.io/projects/spring-kafka) hides the 
consumer instance inside the class `org.springframework.kafka.listener.KafkaMessageListenerContainer.listenerConsumer`
with a `private` access. 
Even with extra motivation, when accessing the private field via Java Reflection, for resetting 
its offset, the operations on it will fail because multi-threaded
access on the consumer is not supported (see `org.apache.kafka.clients.consumer.KafkaConsumer.acquire` method).


But even with the limitation of not being able to reset the consumer offset,
it is still quite useful to ensure the fact that the right service is being called to handle
Kafka message sent over the topic (otherwise said, regression test).


## Source code


The proof of concept project [kafkalistener-e2e-test](https://github.com/findinpath/kafkalistener-e2e-test) offers 
two end-to-end sample tests:

- `com.findinpath.kafka.listener.UserBookmarkEventAvroListenerTest` : for 
testing the consumption of messages serialized in [AVRO](https://avro.apache.org/) format
- `com.findinpath.kafka.listener.UserBookmarkEventJsonListenerTest` : for 
testing the consumption of messages serialized in `JSON` format 

Run the command

```bash
mvn clean install
```

for executing the tests from this project.