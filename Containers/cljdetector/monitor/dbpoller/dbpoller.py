"""A simple Flask application that monitors a mongoDB"""

import os
import flask
from pymongo import MongoClient

import time 
app = flask.Flask(__name__)
DBHOST = os.getenv('DBHOST', 'localhost')
DBNAME = os.getenv('DBNAME', 'cloneDetector')

CSV_FILE = 'data.csv'

def connect_to_db():
    """Connect to the mongoDB"""
    client = MongoClient(f"mongodb://{DBHOST}:27017/")
    db = client[DBNAME]
    if db is not None:
        print("Connected to MongoDB at {} and using database '{}'".format(DBHOST, DBNAME))
    else:
        raise Exception("Could not connect to database")
    return db


def write_to_csv(db, columns):
    """Write database contents to a CSV file"""
    with open(CSV_FILE, 'a') as f:
        for coll in columns:
            count = db[coll].count_documents({})
            f.write('{},'.format(count))
        f.write('\n')
    print("Database contents written to {}".format(CSV_FILE))

def clear_csv():
    """Clear the CSV file"""
    with open(CSV_FILE, 'w') as f:
        f.write('')
    print("{} cleared".format(CSV_FILE))

def write_column_headers():
    """Write column headers to the CSV file"""
    collections = ["files", "chunks", "candidates", "clones", "statusUpdates"]
    with open(CSV_FILE, 'a') as f:
        f.write('' + ','.join(collections) + '\n')
    print("Column headers written to {}".format(CSV_FILE))
    return collections

def find_new_status(db, last_timestamp):
    """Find new status updates since last_timestamp"""
    new_statuses = db.statusUpdates.find({'timestamp': {'$gt': last_timestamp}}).sort('timestamp', 1)
    return list(new_statuses)

if __name__ == '__main__':
    
    print("Starting DB poller...")
    clear_csv()
    db = connect_to_db()
    while db is None:
      time.sleep(1)
      db = connect_to_db()
      print("Retrying DB connection...")
    
    columns = write_column_headers()
    
    while True:
        time.sleep(1)  # Poll every 1 second
        timestamp = time.time()
        new_statuses = find_new_status(db, timestamp)
        for status in new_statuses:
            print("New status update: {}".format(status))
            timestamp = status['timestamp']
        write_to_csv(db, columns)

