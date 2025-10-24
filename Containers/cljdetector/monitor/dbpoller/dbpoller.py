"""A simple Flask application that monitors a mongoDB"""

import os
import flask
from pymongo import MongoClient

import time 
app = flask.Flask(__name__)
DBHOST = os.getenv('DBHOST', 'localhost')
DBNAME = os.getenv('DBNAME', 'cloneDetector')

DATA_COUNT_FILE = 'data.csv'
STATUS_UPDATES_FILE = 'status_updates.csv'

def connect_to_db():
    """Connect to the mongoDB"""
    client = MongoClient(f"mongodb://{DBHOST}:27017/")
    db = client[DBNAME]
    if db is not None:
        print("Connected to MongoDB at {} and using database '{}'".format(DBHOST, DBNAME))
    else:
        raise Exception("Could not connect to database")
    return db


def write_to_counts(db, columns, elapsed_time):
    """Write database contents to a CSV file"""
    with open(DATA_COUNT_FILE, 'a') as f:
        for coll in columns:
            if coll == 'timestamp':
                f.write('{},'.format(int(elapsed_time)))
                continue
            count = db[coll].count_documents({})
            f.write('{},'.format(count))
        
        f.write('\n')
    print("Database contents written to {}".format(DATA_COUNT_FILE))

def write_status_updates(db):
    """Write status updates to a CSV file"""
    updates = db['statusUpdates'].find().sort('timestamp', 1)
    with open(STATUS_UPDATES_FILE, 'w') as f:
        f.write('timestamp,message\n')
        for update in updates:
            f.write('{},{}\n'.format(update['timestamp'], update['message']))
    print("Status updates written to {}".format(STATUS_UPDATES_FILE))

def clear_csv():
    """Clear the CSV file"""
    with open(DATA_COUNT_FILE, 'w') as f:
        f.write('')
    print("{} cleared".format(DATA_COUNT_FILE))

def write_column_headers():
    """Write column headers to the CSV file"""
    collections = ["files", "chunks", "candidates", "clones", "statusUpdates", "timestamp"]
    with open(DATA_COUNT_FILE, 'a') as f:
        f.write('' + ','.join(collections) + '\n')
    print("Column headers written to {}".format(DATA_COUNT_FILE))

    with open(STATUS_UPDATES_FILE, 'w') as f:
        f.write('timestamp,message\n')
    return collections


if __name__ == '__main__':
    print("Starting DB poller...")
    clear_csv()
    db = connect_to_db()
    while db is None:
      time.sleep(1)
      db = connect_to_db()
      print("Retrying DB connection...")
    
    columns = write_column_headers()
    
    start_time = time.time()
    while True:
        time.sleep(5)  # Poll every 5 seconds
        elapsed_time = time.time() - start_time
        write_to_counts(db, columns, elapsed_time)
        write_status_updates(db)

