import { getQueryFunction } from "./postgres";

const {query, end} = getQueryFunction();

async function createDB() {
    try {
        
    } catch(e) {
        console.error(e)
        //process.exit(1)
    } finally {
        end()
    }
}

export const DBCreationPromise = createDB();

export default DBCreationPromise;