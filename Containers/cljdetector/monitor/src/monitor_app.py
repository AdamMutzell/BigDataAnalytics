"""A simple Flask application that monitors a mongoDB"""

import os
import flask
from pymongo import MongoClient
import time
import seaborn as sns
from io import BytesIO
import pandas as pd
import matplotlib.pyplot as plt
import base64

DBHOST = os.getenv('DBHOST', 'localhost')
DBNAME = os.getenv('DBNAME', 'cloneDetector')
app = flask.Flask(__name__)
app.config['DBHOST'] = DBHOST
app.config['DBNAME'] = DBNAME

DATA = "data/data.csv"
DATA_PATH = os.path.join(os.path.dirname(__file__), 'dbpoller', 'data.csv')

STATUS = "data/status_updates.csv"
STATUS_PATH = os.path.join(os.path.dirname(__file__), 'dbpoller', 'status_updates.csv')
formating = {
    'axes.titlesize': 16,
    'axes.labelsize': 14,
    'xtick.labelsize': 12,
    'ytick.labelsize': 12,
    'legend.fontsize': 12
}
status_mapping ={
    "files": 2,
    "chunks": 3,
    "candidates": 6,
    "clones": 6
}

@app.route('/')
def index():
    """Index page"""
    app.logger.info("Rendering index page, connecting to DB at {} using database '{}'".format(app.config['DBHOST'], app.config['DBNAME']))
    df = pd.read_csv(DATA_PATH, index_col=False)
    df_status = pd.read_csv(STATUS_PATH, index_col=False)
    print_db_contents()
    status_updates = get_status_updates(df_status)
    cmap = generate_colormapping(len(df.columns))
    url = plot_data(df, cmap)
    deriv_url = plot_derivates(df, cmap)
    stats = get_some_statistics(df)
    avg_clone_size = average_clone_size()
    return flask.render_template('index.html', 
        dbhost=app.config['DBHOST'], 
        dbname=app.config['DBNAME'],
        candidates_per_file=stats['candidates_per_file'],
        clones_per_file=stats['clones_per_file'],
        chunks_per_file=stats['chunks_per_file'],
        average_clone_size=avg_clone_size,
        plot_url=url,
        deriv_plot_url=deriv_url,
        status_updates=status_updates
    )


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

def average_clone_size():
    db = connect_to_db()
    """Calculate the average clone size from the database"""
    clones = db["clones"]
    app.logger.info(f"Calculating average clone size... {clones}")
    app.logger.info(f"Clone attributes... {clones.find_one()}")
    total_size = 0
    total_clones = clones.count_documents({})
    for clone in clones.find():
        clone = clone.get('instances', [])[0]
        size = clone.get('endLine', 0) - clone.get('startLine', 0)
        total_size += size
    if total_clones > 0:
        return round(total_size / total_clones, 2)
    return 0

def get_some_statistics(df):
    """Get some statistics from the database"""
    max_values = df.max()

    clones_per_file = max_values['clones'] / max_values['files'] if max_values['files'] > 0 else 0
    candidates_per_file = max_values['candidates'] / max_values['files'] if max_values['files'] > 0 else 0
    chunks_per_file = max_values['chunks'] / max_values['files'] if max_values['files'] > 0 else 0
    stats = {
        'clones_per_file': round(clones_per_file, 2),
        'candidates_per_file': round(candidates_per_file, 2),
        'chunks_per_file': round(chunks_per_file, 2)
    }
    return stats

def derivative(x, y):
    """Calculate the derivative of y with respect to x"""
    dy = y.diff()
    dx = x.diff()
    derivative = dy / dx
    return derivative

def plot_data(df, cmap):
    """Plot data from CSV file"""

    plt.figure(figsize=(10, 6))
    sns.set_theme(style="whitegrid")
    fig, axs = plt.subplots(2, 2, figsize=(16, 10))
    # Multiple separate plots
    for i, column in enumerate(df.columns[:4]):
        data = df[df['statusUpdates'] == status_mapping[column]]
        if data.empty:
            continue
        ax = axs[i // 2, i % 2]

        sns.lineplot(data=data, x='timestamp', y=column, ax=ax, label=column, color=cmap[i])
        ax.set_title(f"{column} over Time")
        ax.set_xlabel("Time (s)")
        ax.set_xlim(data['timestamp'].min(), data['timestamp'].max())

    plt.tight_layout()

    img = BytesIO()
    plt.savefig(img, format='png')
    img.seek(0)
    return base64.b64encode(img.getvalue()).decode('utf8')

def plot_derivates(df, cmap):
    """Plot derivatives of data from CSV file"""

    plt.figure(figsize=(10, 6))
    sns.set_theme(style="whitegrid")

    fig, axs = plt.subplots(figsize=(16, 10), nrows=2, ncols=2)
    # Multiple lines on the same plot
    for i, column in enumerate(df.columns[:4]):
        data = df[df['statusUpdates'] == status_mapping[column]]
        if data.empty:
            continue

        deriv = derivative(data['timestamp'], data[column])

        sns.lineplot(data=data, x='timestamp', y=deriv, ax=axs[i // 2, i % 2], label=f"d{column}/dt", color=cmap[i])
        axs[i // 2, i % 2].set_title(f"Derivatives of {column} over Time")

    plt.tight_layout()

    img = BytesIO()
    plt.savefig(img, format='png')
    img.seek(0)
    return base64.b64encode(img.getvalue()).decode('utf8')

def get_status_updates(df):
    """Get status updates from the CSV file"""
    updates = df[['timestamp', 'message']].drop_duplicates().sort_values(by='timestamp', ascending=False).iloc[::-1]
    return updates.to_dict(orient='records')

def generate_colormapping(n_colors):
    """Generate a colormap with n colors"""
    cmap = sns.color_palette("bright", n_colors)
    return cmap

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7003)
    
