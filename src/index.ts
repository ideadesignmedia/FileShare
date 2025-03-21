import '@ideadesignmedia/config.js'
import DBCreationPromise from './database/create-db'
import { AppDataSource } from './database/data-source'
import { connectToServer } from './external-server'
import { startServer } from './internal-server';


DBCreationPromise.then(() => AppDataSource.initialize()).then(() => {
    connectToServer()
    startServer()
}).catch((error) => {
    console.error("Database Connection Error:", error)
    process.exit(1);
});
