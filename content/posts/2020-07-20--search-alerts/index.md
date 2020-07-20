---
title: Search Alerts
tags: ["elasticearch","percolator", "kafka", "cassandra"]
cover: markus-winkler-cxoR55-bels-unsplash.png
author: findinpath
---


Send notifications to the users whenever new content matching their interests is added
on the platform.

Search alerts are designed to monitor changes to the documents being searched, whereas search engines
are designed for finding documents matching a specific search term.

Check out the blog post on percolator to get an idea on how the search upside down works in Elasticsearch:


<blockquote class="twitter-tweet"><p lang="pt" dir="ltr">A short primer <a href="https://twitter.com/hashtag/elasticsearch?src=hash&amp;ref_src=twsrc%5Etfw">#elasticsearch</a> percolator <a href="https://t.co/TLglOY15Kf">https://t.co/TLglOY15Kf</a></p>&mdash; findinpath (@findinpath) <a href="https://twitter.com/findinpath/status/1283027120109883404?ref_src=twsrc%5Etfw">July 14, 2020</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>



This proof of concept handles both kind of notifications for its users:

- immediate: as soon as new content of interest is made available
- batched: hourly/ daily/ weekly in case there new content of interest is made available

For the sake of better understanding the purpose of this system there will be considered
that this system handles the search alert functionality for a news platform.

The users of the news platform which have interest for a certain topic can register search alerts
to be notified (e.g.: by email) when new articles matching their criteria are published on the platform.
The search alerts can be configured by the users to send notifications immediately/ hourly/ daily/ weekly
about new interesting content.

## Technological stack

The tech stack of the presented system makes use of:

- [Apache Kafka](https://kafka.apache.org/) for streaming data between the components of the system
- [Elasticsearch](https://www.elastic.co/elasticsearch/) distributed, RESTful search engine providing
[percolator](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-percolate-query.html) functionality
- [Apache Cassandra](https://cassandra.apache.org/) for storing information about the search alert
messages already sent in order to avoid sending duplicated messages (e.g.: for a batched search alert on a specific hour/day).

## Architecture

<re-img src="search-alerts-architecture.png"></re-img>

There are some subtle differences in handling the immediate and the batched search alerts.

The search alert immediate notifications should be sent as their name denotes as soon as a corresponding
news is being published, whereas the batched notifications are to be sent only after their corresponding
frequency time window (e.g.: hour/day/week) elapses.

### Percolator

This is a rather simple component which consumes news records from the input Apache Kafka topic,
percolates them and writes each of the corresponding search alerts retrieved from Elasticsearch
to its corresponding topic to be consumed by:

- the _immediate-messenger_ component in case that the search alert has an immediate notification policy
- the _batched-messenger_ component in case that the search alert has a batched notification policy

The search alerts stored in Elasticsearch should store at a minimum meta information like:

- the notification policy: immediate/hourly/daily/weekly
- the email address of the user who registered the search alert


### Immediate search alerts

Handling immediate search alerts is relatively straightforward by following the architecture concept
diagram presented above.

Each time a new document (e.g. : news) is being percolated, for each of the corresponding search alerts
there will be written to the `immediate` Apache Kafka topic an entry containing:

- news details
- search agent details

Using the search alert id as record key for the message sent towards the topic `immediate` ensures
that the notifications sent for a search alert will be handled in a serial fashion (which comes in handy
when checking for duplicates).

On the _immediate-messenger_ side, the record will be simply sent to the mail (or push) notification service and
will be subsequently recorded to the database to avoid sending duplicate messages to the user in case
of errors/bugs on the _percolator_ component side.

To avoid sending duplicates, in the Cassandra database backing the _immediate-messenger_ component will be
checked before sending a notification whether for the key:

- search alert id (partition key)
- news id (clustering key)

has already been recorded.

The body of the notification for the search alert is composed out of the incoming news details
in the consumer record from `immediate` Apache Kafka topic.


### Batched search alerts

If the immediate search alerts are sent straight away after percolating a new document (e.g.: news),
the batched search alerts on the other hand need to be _"parked"_ until their corresponding
notification period (e.g.: hour/day/week) elapses.

Considering that a search alert is configured to hourly notify a user about new articles matching a specific
search criteria, when an article is being published on  `2020-06-19 09:21:05` on the news platform,
the search alert should then notify the user at `2020-06-19 10:00:00`.

The approach used by this proof of concept to solve this problem is to use corresponding topics for each
kind of frequency window(hour/day/week) offered by the search alert service.

In the above mentioned case, the search alert information would be pushed to the topic
`hourly_1592553600000` (`1592553600000` corresponds  to `2020-06-19 10:00:00`).
In case that the search alert would have been configured to delivery notifications daily, then
the search alert information would be then published to the topic `daily_1592604000000` (`1592604000000`
corresponds to `2020-06-20 00:00:00`).

The consumption of the entries from the `hourly_1592553600000` topic will start at the earliest
at `2020-06-19 10:00:00`.
The consumption of the entries from the `daily_1592604000000` topic will start at the earliest
at `2020-06-20 00:00:00`.

The _batched-messenger_ component is responsible for handling the batched
search alerts from a specified topic that contain entries for the hourly/daily/weekly search alerts.
The consumption from the Apache Kafka topic corresponding to a specific hour/day/week time window
will begin only after its corresponding time window has elapsed.
Once the consumption of the Apache Kafka topic reaches the end of the topic, the
_batched-messenger_ component instance can end its runtime because there will be no new content
added to this topic in the future.

Once all the partitions of the Apache Kafka topic `hourly_1592553600000` are fully read by the
_batched-messenger_ component (current offset is equal with the end offset on all the partitions
of the topic), the batched topic can be considered obsolete (and can be eventually be deleted)
and not being taken anymore into consideration for consumption.

To avoid sending duplicates, in the Cassandra database backing the _batched-messenger_ component will be
checked before sending a notification whether for the key:

- search alert id (partition key)
- frequency (clustering key. possible values: hour/day/week)

there has already been recorded a timestamp corresponding for the beginning of the frequency window
that is the same (or higher) as the current frequency window being handled by the _batched-messenger_
component.

Using the search alert id as record key for the messages sent from the _percolator_ component
towards the batched topics ensures that the notifications sent for a search alert will be handled
in a serial fashion (which comes in handy when checking for duplicates).

The body of the notification for the search alert is composed out of the latest news retrieved
by running the search query corresponding to the search alert (from the consumer record of the
Apache Kafka batched topic) on Elasticsearch.

**OPTIONAL** In case of finding a matching batched search alert for a percolated news article, the _percolator_ component
should be responsible to _"pause"_  the search alert until its current batching period (hour/day/week) elapses in order to
avoid doing unnecessary matches against new incoming articles.

#### Orchestrating batched messengers

As mentioned previously, the batched  search alert notifications need to be _"parked"_ until their corresponding
notification period(hour/day/week) elapses.

At the beginning of each batched time window (hour/day/week) should be therefor started one or multiple instances
of the _batched-messenger_ component for the batched Apache Kafka topics on which the consumer offset
of the _batched-messenger_ lags behind.

Depending on the amount of the batched search alert hits from the topic that need to be processed, the
orchestrator could then choose how many instances of the _batched-messenger_ component to spawn.

## Code

Being a proof of concept, this blog post is accompanied by a the
[search-alert](https://github.com/findinpath/search-alert) Github project which contains
the following modules:

- percolator
- immediate-messenger
- batched-messenger

which fit to the description from the _Architecture_ section.

The [search-alert](https://github.com/findinpath/search-alert) Github project makes heavy use
of the [testcontainers](https://www.testcontainers.org/) library for spawning during the tests
trowaway containers for:

- Apache Kafka
- Elasticsearch
- Apache Cassandra

in order to test the functionality of the code in a realstic fashion.

**NOTE**: The current implementation of the mailing service from the _messenger_ projects doesn't actually
send email notifications, but just logs them.

## Open points

A key point that hasn't been covered
by the [search-alert](https://github.com/findinpath/search-alert) Github project accompanying this
blog post is the orchestration of the batched messengers.

At the beginning of each batched time window (hour/day/week) there should run a program in a cron
fashion to spawn _batched-messenger_ instances for the previous time window. In case of eventual
previous failures (when batched Apache Kafka topics having consumer offset lagging behind the end offset),
this program should also spawn _batched-messenger_ instances for other previous time windows.

The garbage collection for obsolete batched Apache Kafka
topics (current offset is equal with the end offset on all the partitions
of the topic) should also be taken care of by the above described program.

Probably one of the next posts will tackle this problem with [kubernetes](https://kubernetes.io/).
