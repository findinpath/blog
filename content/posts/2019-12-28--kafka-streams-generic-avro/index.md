---
title: Process generic avro records in Kafka Streams
tags: ["kafka-streams", "avro"]
cover: unsplash-laurynas-mereckcas-generics.jpg
author: findinpath
---


Via [Kafka Streams](https://kafka.apache.org/documentation/streams/) can be processed 
[avro](https://avro.apache.org/) records of different types in order to benefit of the 
ordering of the events that relate to the same domain entity.

As described in Martin Kleppmann's article [Should you put several event types in the same Kafka topic](https://www.confluent.io/blog/put-several-event-types-kafka-topic/) there are good reasons why it would
make sense to stuff multiple event types in the same Kafka topic:

>The most important rule is that any events that need to stay in a fixed order must go in the same topic (and they must also use the same partitioning key). Most commonly, the order of events matters if they are about the same entity.


If the data encoding for the records passed through Apache Kafka topic is JSON it is then relatively 
easy to setup an application consuming the records. The problems occur when there are modifications brought to the schema of the records in order to match the new business requirements of the system
because these changes make it difficult to know what version of the JSON objects are we dealing with
Different clients can very likely use different versions for the schema of the JSON object that they
send for processing, but the Kafka application on the receiving end needs to be able to accurately
process *ALL* the JSON objects.
This is why the Apache Kafka [documentation](https://www.confluent.io/confluent-schema-registry/)  highly encourages the usage of the [avro](https://avro.apache.org/) library for data encoding of the records passed through Apache Kafka topics.


Processing generic records comes at the cost of having a higher complexity on the
Apache Kafka consumer side, but having the ability to keep in order the events happening on a domain entity is worth the trouble.
A concrete example to showcase the need to keep in order the events for an entity would be the
registration of a new user of a site and subsequently the change of the address of the user via his profile page.  In this case, the Apache Kafka application consuming the events related to users may
process an address change for a user that does not exist if the event corresponding for the creation
of the new user has been delayed.


This article is accompanied by the [kafka-streams-generic-avro](https://github.com/findinpath/kafka-streams-generic-avro) sample project which showcases the strategies available for Kafka Streams
to cope with generic avro records.

The topologies showcased in the project are overly simplistic with the sole purpose of echoing the
information that they receive for processing to the destination topics. 


```java
    records
        .peek((key, record) -> LOGGER
            .info("Processing entry with the key " + key + " and value " + record))
        .to(outputTopic);
```


The test code based on [testcontainers](https://www.testcontainers.org/) corresponding
to these topologies is used to showcase the differences between the two strategies available for
processing generic avro records:

- `GenericRecord`
- `SpecificRecord`

## Generic Record Topologies

The main advantages of building topologies based on the type `org.apache.avro.generic.GenericRecord` is 
that there can be processed virtually any kind of messages by the client. This is pretty much similar to
processing JSON objects without prior knowledge of their types.

## Specific Record Topologies

When consuming specific records, based on the type `org.apache.avro.generic.SpecificRecord`, the code of
the topology has the benefit of working with typed records, which can ease up the handling of these records.
The one possible inconvenient in this case is that the topology must have in its classpath the types of the 
records that it intends to process.


## Pattern for handling the records

A possibility to handle a finite amount of record types is to have a series of `if` statements
chained together:

```java
   if (BookmarkEvent.equals(record.getClass()){
       // ...
   } else if (UserCreatedEvent.equals(record.getClass())){
       // ...
   } else{

   }
```

The main problem with this approach is that the more record types the topology tends to handle,
the longer (and error prone) this handling code based on the type gets. 

An alternative to chained `if` statements is the usage of a handler map:

```java
    final Map<Class<? extends SpecificRecord>, BiConsumer<String, SpecificRecord>> handlers = new HashMap<>();

    handlers.put(BookmarkEvent.class, (key, record)-> LOGGER
        .info("Processing bookmark entry with the key " + key + " and value " + record));

    handlers.put(UserCreatedEvent.class, (key, record)-> LOGGER
        .info("Processing user created entry with the key " + key + " and value " + record));

    records
        .peek((key, record) -> handlers
            .getOrDefault(record.getClass(),
                (k, r) -> LOGGER.error("Handler not configured for the record " + record + " with key "+ key + " of type " + record.getClass()))
            .accept(key, record))
        .to(outputTopic);

```


## Schema Registry settings

As already mentioned in the article [Should you put several event types in the same Kafka topic](https://www.confluent.io/blog/put-several-event-types-kafka-topic/) in order to deal with several event types
in the same topic there are two options for naming the avro subjects in the [Confluent Schema Registry](https://www.confluent.io/confluent-schema-registry):


- `io.confluent.kafka.serializers.subject.RecordNameStrategy`
- `io.confluent.kafka.serializers.subject.TopicRecordNameStrategy`


In the sample project [kafka-streams-generic-avro](https://github.com/findinpath/kafka-streams-generic-avro) the `RecordNameStrategy` was used for naming the subjects
corresponding to the record values that are written to the input Apache Kafka topic.



```java
    streamsConfiguration.put(AbstractKafkaAvroSerDeConfig.VALUE_SUBJECT_NAME_STRATEGY,
        RecordNameStrategy.class);
```


## Sample code

Checkout the github project sample project [kafka-streams-generic-avro](https://github.com/findinpath/kafka-streams-generic-avro) and try out the [GenericKafkaStreamsAvroDemoTest](https://github.com/findinpath/kafka-streams-generic-avro/blob/master/src/test/java/com/findinpath/GenericKafkaStreamsAvroDemoTest.java) test case to get see the concepts exposed above in action.