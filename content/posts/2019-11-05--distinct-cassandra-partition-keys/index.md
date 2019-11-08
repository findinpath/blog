---
title: Retrieve the distinct partition keys of a Cassandra table
tags: ["cassandra", "testcontainers"]
cover: photo-1513542789411-b6a5d4f31634.jpg
author: findinpath
---

Selecting the distinct partition keys of a Cassandra table is very straightforward when performing a CQL query to retrieve the first page
of `DISTINCT` partition keys of the Cassandra table, but in order to select _all_ the distinct partition keys of the table without needing
to retrieve all the rows of the table the `TOKEN` Cassandra function  needs to be employed. 


<re-img src="photo-1513542789411-b6a5d4f31634.jpg"></re-img>


Let's consider for the sake of having a concrete example to work on that we store the bookmarks made by the users
in a Cassandra table.

```sql
CREATE TABLE DEMO.USER_BOOKMARKS (
	user_id UUID,
	timestamp TIMEUUID,
	url VARCHAR,
	PRIMARY KEY (user_id, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC)
```					


When the following query:

```sql 
SELECT DISTINCT user_id
FROM demo.user_bookmarks
LIMIT 1000
```

is executed, it will provide the first page containing 1000 distinct partition keys of the table `demo.user_bookmarks`.

For selecting the next page, an extra filter based the `TOKEN` function has to be employed in order to retrieve 
the next page of distinct partition keys which all have the token greater as the token of the last `user_id` selected on the previous page.


```sql 
SELECT DISTINCT user_id
FROM demo.user_bookmarks
WHERE TOKEN(user_id) > TOKEN(userIds[999]) 
LIMIT 1000
```



The corresponding java implementation looks like this:

```java
private ResultSet getDistinctUserIdsBatch(Session session, Optional<UUID> lastUserIdProcessed,
		int batchSize) {
	var batchedDistinctUserSelect = QueryBuilder.select(USER_ID_COLUMN_NAME)
			.distinct()
			.from(DEMO_KEYSPACE_NAME, USER_BOOKMARKS_TABLE_NAME);

	lastUserIdProcessed.ifPresent(
			uuid -> batchedDistinctUserSelect.where(gt(token(USER_ID_COLUMN_NAME), token(uuid))));

	batchedDistinctUserSelect.limit(batchSize);

	return session.execute(batchedDistinctUserSelect);
}
```


The [Cassandra TOKEN documentation](https://docs.datastax.com/en/archived/cql/3.3/cql/cql_using/useToken.html) is a good starter to
get a feeling of what the `TOKEN` function does.



The java project [cassandra-select-distinct-partition-keys](https://github.com/findinpath/cassandra-select-distinct-partition-keys/)
provides a runnable test which starts a Cassandra docker container (via [testcontainers](https://www.testcontainers.org/) library)
fills it with data (the bookmarks made by a list of random users) and selects the distinct user identifiers.

Simply use `mvn clean install` for trying out the project.
