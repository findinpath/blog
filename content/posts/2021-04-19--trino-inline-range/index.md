---
title: Inline Trino integer ranges
tags: ["trino", "presto"]
cover: jeffrey-brandjes-1VC3rtGcQis-unsplash.png
author: findinpath
---

This post shows a few ways to create inline integer ranges in Trino.


While playing with a new database it is quite useful to have the ability to easily create
a table with a integer range content (`1`, `2`, `3`, `4` and so on ...) on which can be executed `SELECT` statements.


## Use the memory connector and fill the table

Obviously one way to have a table to play with would be  to actually create a table and fill it
with values.

A simple way to implement this scenario is by using the Trino [memory](https://trino.io/docs/current/connector/memory.html)
connector.

To configure the Memory connector, create a catalog properties file etc/catalog/memory.properties with the following contents:

```bash
connector.name=memory
memory.max-data-per-node=128MB
```


Create a table used for test purposes:

```sql
CREATE TABLE memory.default.test (value INTEGER);
```

Fill the table with values:

```sql
INSERT INTO memory.default.test (value) (VALUES 1,2,3,4,5,6,7,8,9,10);
```

Now, the inserted values can be queried/summed/counted:

```sql
SELECT value FROM memory.default.test;
```

Now obviously, the main inconvenient of this method is that the `memory` connector needs to be configured
on Trino before starting to play with the range values.

## Use an inline table

```sql
SELECT * FROM (VALUES 1, 2, 3, 4, 5, 6, 7, 8, 9, 10) as t(value)
```

Consult the documentation for [VALUES](https://trino.io/docs/current/sql/values.html) SQL statement for more details.

The main benefit of this method is that is quite straightforward and it does everything in one split.

As explained on Trino [documentation](https://trino.io/docs/current/overview/concepts.html?highlight=concepts#split)

> Tasks operate on splits, which are sections of a larger data set. Stages at the lowest level of a distributed query plan retrieve data via splits from connectors, and intermediate stages at a higher level of a distributed query plan retrieve data from other stages.
>
> When Trino is scheduling a query, the coordinator queries a connector for a list of all splits that are available for a table. The coordinator keeps track of which machines are running which tasks, and what splits are being processed by which tasks.


## Unnest a generated sequence

This method requires the least typing:

```sql
SELECT value FROM UNNEST(SEQUENCE(1,10)) AS t(value);
```

Consult the documentation for [UNNEST](https://trino.io/docs/current/sql/select.html#unnest) and [SEQUENCE](https://trino.io/docs/current/functions/array.html?highlight=sequence#sequence) for more details.

`UNNEST` can be used also for an arbitrary array of integers:

```sql
SELECT value FROM UNNEST(ARRAY[1,2,3,4,5,6,7,8,9,10]) AS t(value);
```

## Inline the range via `UNION ALL`

This method is syntactically similar to the one use to inline a table:

```sql
SELECT 1 as value UNION ALL
SELECT 2  UNION ALL
SELECT 3  UNION ALL
SELECT 4  UNION ALL
SELECT 5  UNION ALL
SELECT 6  UNION ALL
SELECT 7  UNION ALL
SELECT 8  UNION ALL
SELECT 9  UNION ALL
SELECT 10;
```

The main drawback in terms of efficiency of this method is that for each `UNION ALL` it creates a new Trino split.


## Inline the range via `WITH RECURSIVE` clause

By means of recursiveness there can be obtained a similar result as with `UNION ALL` :

```sql
WITH RECURSIVE t(value) AS (
   VALUES (1)
   UNION ALL
   SELECT value + 1 FROM t WHERE n < 10
)
SELECT value FROM t;
```


Consult [WITH RECURSIVE](https://trino.io/docs/current/sql/select.html#with-recursive-clause) documentation for more details.

Also in this case, the main drawback in terms of efficiency of this method is that for each `UNION ALL` it creates a new Trino split.

## Feedback

This blog post serves as a collection of methods that can be used for obtaining without too much effort integer
ranges in Trino.

There are obviously other methods to obtain this functionality. Feel free to suggest new ways of easily obtaining
ranges.
