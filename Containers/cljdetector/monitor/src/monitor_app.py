"""A simple Flask application that monitors a mongoDB"""

import os
import flask
from pymongo import MongoClient
import time

DBHOST = os.getenv('DBHOST', 'localhost')
DBNAME = os.getenv('DBNAME', 'cloneDetector')
app = flask.Flask(__name__)
app.config['DBHOST'] = DBHOST
app.config['DBNAME'] = DBNAME

@app.route('/')
def index():
    """Index page"""
    app.logger.info("Rendering index page, connecting to DB at {} using database '{}'".format(app.config['DBHOST'], app.config['DBNAME']))
    print_db_contents()
    return flask.render_template('index.html', dbhost=app.config['DBHOST'], dbname=app.config['DBNAME'])


def connect_to_db():
    """Connect to the mongoDB"""
    client = MongoClient(f"mongodb://{app.config['DBHOST']}:27017/")
    db = client[app.config['DBNAME']]
    if db is not None:
        app.logger.info("Connected to MongoDB at {} and using database '{}'".format(app.config['DBHOST'], app.config['DBNAME']))
    else:
        raise Exception("Could not connect to database")
    return db

@app.route('/status')
def get_status_updates():
    """Retrieve status updates from the database"""
    try:
        db = connect_to_db()
    except Exception as e:
        return "Error connecting to database: {}".format(e), 500
    print("Fetching status updates from the database...")
    updates = db.statusUpdates.find().sort('timestamp', -1).limit(10)
    return list(updates)

@app.route('/contents')
def print_db_contents():
    """Print the contents of the database collections"""
    db = connect_to_db()
    app.logger.info("Database contents:")
    collections = db.list_collection_names()
    app.logger.info("Found collections: {}".format(collections))
    for coll in collections:
        count = db[coll].count_documents({})
        app.logger.info("Collection '{}' has {} documents".format(coll, count))
    return flask.render_template('index.html', dbhost=app.config['DBHOST'], dbname=app.config['DBNAME'])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7003)
    
