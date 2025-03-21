import { Pool, Query } from 'pg';

export const connectionOptions = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
    ssl: {
        rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10
};

export const getQueryFunction = (config = {}) => {
    const pool = new Pool({ ...connectionOptions, ...config });

    pool.on('error', (err: Error) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
    });

    const query = (text: string, args?: any[], transform = (data: any): any => data): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            pool.connect().then(client => {
                const result: any[] = [];
                let isRejected = false;
                const request = client.query(new Query(text, args));
                request.on('row', (row) => {
                    if (!isRejected) result.push(transform(row));
                });
                request.on('error', (err) => {
                    console.error('QUERY ERROR:', text, args, err);
                    isRejected = true;
                    reject(err);
                    client.release();
                });
                request.on('end', () => {
                    if (!isRejected) {
                        resolve(result);
                    }
                    client.release();
                });
            }).catch(reject);
        });
    };

    return {
        end: () => {
            pool.end().catch(e => console.error('Error ending pool:', e));
        },
        query,
    };
};