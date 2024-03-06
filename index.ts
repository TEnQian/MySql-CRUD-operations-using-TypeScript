import * as http from 'http';
import * as express from 'express';
import * as mysql from 'mysql2/promise';

const app = express();

const credentials : string = "Imagint1024";

const AuthorizationPass : string = "Basic " + credentials;

let errorMessage : string;

app.use(express.json());

const pool : mysql.Pool = mysql.createPool({
    host : "localhost",
    user: 'root',
    password: "",
    database: "dbname"
});

interface RequestParams extends express.Request {
    query: {
        jobID : string,
        jobTitle : string,
        jobContent : string,
        category : string,
        permitType : string,
        locations : string[],
        s : string //Search string (Example : ?s=Teacher)
    }
}

type QueryResult = mysql.OkPacket | mysql.RowDataPacket[] | mysql.ResultSetHeader[] | mysql.RowDataPacket[][] | mysql.OkPacket[] | mysql.ProcedureCallPacket;
type QueryError = mysql.QueryError | null;

type QueryFunction = (sqlQuery: string, params: any[] | null) => Promise<QueryResult>;
type TransactionFunction = (...args) => Promise<void>;

//Function to check variable is string
export function isString(input : any) : boolean{
    if(typeof input === 'string'){
        return true;
    }

    return false;
}

//Function to check variable is array
export function isStringArray(input : any) : boolean {
    if(Array.isArray(input) === true){
        return true;
    }

    return false;
}

//Function to check user authentication status
async function checkAuthentication(userAuthenticationToken : string | null) : Promise<number>{
    let authenticationStatus : number;
    if(userAuthenticationToken){
        if(userAuthenticationToken === AuthorizationPass){
            return authenticationStatus = 1; // Pass
        }
        else{
            return authenticationStatus = 2; //Wrong authentication token
        }
    }
    else{
        return authenticationStatus = 3; // No authentication token included
    }
}

interface jobPost{
    id : number,
    post_title : string,
    post_content : string,
    category_id : number,
    permit_type_id : number,
    job_post_id : number,
    location_id : number
}

//Get Request
app.get('/jobs', async function(req : RequestParams, res ,next) {
    let requestedJobTitle : string = req.query.jobTitle;
    const requestedCategory : string = req.query.category;
    const requestedPermitType : string = req.query.permitType;
    const requestedLocationsArray : string[] = req.query.locations;
    let requestedSearchString : string = req.query.s;

    if(!requestedJobTitle && !requestedLocationsArray && !requestedCategory && !requestedPermitType && !requestedSearchString){
        try{
            await runTransaction(async query => {
                const currentQueryResult : QueryResult = await query(`
                SELECT *
                FROM job_posts`);
                res.send(currentQueryResult);
            });

            next();
        }
        catch(err){
            errorMessage = JSON.stringify(err);
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }
    }
    else if(!requestedJobTitle && !requestedLocationsArray && !requestedCategory && !requestedPermitType && requestedSearchString){
        requestedSearchString = requestedSearchString.replace("%20","");

        await runTransaction(async query => {
            const currentQueryResult : QueryResult = await query(`
            SELECT 
            * FROM job_posts
            WHERE ((job_posts.category_id)
                    IN (SELECT id 
                        FROM categories
                        WHERE categories.name LIKE CONCAT("%",?,"%")))
                OR ((job_posts.permit_type_id)
                    IN (SELECT id 
                        FROM permit_types
                        WHERE permit_types.name LIKE CONCAT("%",?,"%")))
                OR (job_posts.post_title LIKE CONCAT("%",?,"%"))
            `,[requestedSearchString,requestedSearchString,requestedSearchString]);

            if(Object.keys(currentQueryResult[0]).length === 0){
                errorMessage = JSON.stringify('No results found');
                res.send(errorMessage);
                return;
            }
            res.send(currentQueryResult[0]);
        });
        next();
    }
    else{
        try{
            if(requestedJobTitle){
                requestedJobTitle = requestedJobTitle.replace("%20","");
            }

            if(requestedSearchString){
                requestedSearchString = requestedSearchString.replace("%20","");
            }

            await runTransaction(async query => {
                const currentQueryResult : QueryResult = await query(`
                SELECT * 
                FROM job_posts
                WHERE ( (job_posts.category_id)
                        IN (SELECT categories.id
                            FROM categories
                            WHERE (categories.id = COALESCE(NULL, categories.id)) 
                            OR (categories.name LIKE CONCAT('%',NULL,'%'))))
                    AND ( (job_posts.permit_type_id)
                            IN (SELECT permit_types.id
                                FROM permit_types
                                WHERE (permit_types.id = COALESCE(NULL,permit_types.id))    
                                    OR (permit_types.name LIKE CONCAT("%",NULL,"%")) ))
                    AND( (job_posts.post_title = COALESCE("er",job_posts.post_title))
                            OR (job_posts.post_title LIKE CONCAT("%","er","%"))
                            OR (job_posts.post_title LIKE CONCAT("%","er","%")) )
                    AND ((job_posts.id)
                    IN (SELECT job_posts_locations.job_post_id
                        FROM job_posts_locations
                        WHERE job_posts_locations.location_id 
                        IN (COALESCE((NULL), job_posts_locations.location_id)) ))`,
                        [requestedCategory,requestedSearchString,requestedPermitType,requestedSearchString,requestedJobTitle,requestedJobTitle,requestedSearchString,requestedLocationsArray]);

                if(Object.keys(currentQueryResult[0]).length === 0){
                    errorMessage = JSON.stringify('No results found');
                    res.send(errorMessage);
                    return;
                }
                res.send(currentQueryResult[0]);
            });

            next();
        }
        catch(err){
            errorMessage = JSON.stringify(err);
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }
    }
});

//Create request
app.post('/jobs/', async function (req : RequestParams, res, next) {
    const userAuthenticationToken : string =  req.get('Authorization') as string;

    const authenticationStatus : number = await checkAuthentication(userAuthenticationToken);

    if(authenticationStatus === 3){
        errorMessage = JSON.stringify('Unauthorized request, please make sure you include authorization token');
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
    else if(authenticationStatus === 2){
        errorMessage = JSON.stringify('Unauthorized request, please make sure you include correct authorization token');
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
    else if(authenticationStatus === 1){
        let jobPostTile : string = req.body.jobTitle;
        const jobPostContent : string = req.body.jobContent;
        const jobCategoryID : string = req.body.categoryID;
        const jobPermitTypeID : string = req.body.permitTypeID;
        let jobLocations : string[] = req.body.locations;

        if(!jobPostTile){
            errorMessage = JSON.stringify('Parameter jobTitle is required.');
            res.status(400);
            res.send(errorMessage);
            next();
            return;
        }
        else if(!jobPostContent){
            errorMessage = JSON.stringify('Parameter jobContent is required.');
            res.status(400);
            res.send(errorMessage);
            next();
            return;
        }
        else if(!jobLocations){
            errorMessage = JSON.stringify('Please include at least one location id for this job');
            res.status(400);
            res.send(errorMessage);
            next();
            return;
        }
        else if(isStringArray(jobLocations) === false){
            errorMessage = JSON.stringify('Parameter "locations" need to be in array format');
            res.status(400);
            res.send(errorMessage);
            next();
            return;
        }

        if(jobPostTile && jobPostContent && jobLocations){
            jobPostTile = jobPostTile.replace("%20","");
            try{
                await runTransaction(async query => {
                    let insertResult = await query(`
                    INSERT INTO job_posts 
                    (post_title,post_content,category_id,permit_type_id) 
                    VALUES (?,?,?,?)`,[jobPostTile, jobPostContent, jobCategoryID, jobPermitTypeID]); //Insert new job post to `job_posts` table

                    const numID : number = JSON.parse(JSON.stringify(insertResult))[0].insertId;
                    
                    await Promise.all(jobLocations.map(async function(item, index){
                        let currentLocationID = jobLocations[index];
                        await query(`
                        INSERT INTO job_posts_locations
                        (job_post_id, location_id)
                        VALUES (?,?)`,[numID, currentLocationID]); //Insert new data to `job_posts_locations` table
                    }));
                });
                res.send(JSON.stringify("Insert successfully"));
                next();
            }catch(error){
                errorMessage = JSON.stringify("Error, please try again");
                res.status(500);
                res.send(errorMessage);
                next();
                return;
            }
        }
    }
    else{
        errorMessage = JSON.stringify("Unknown authentication error, please check your authentication credentials and try to submit again");
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
});

//Update request
app.put('/jobs/', async function (req : RequestParams, res, next) {
    const userAuthenticationToken : string =  req.get('Authorization') as string;

    const authenticationStatus : number = await checkAuthentication(userAuthenticationToken);

    if(authenticationStatus === 3){
        errorMessage = JSON.stringify('Unauthorized request, please make sure you include authorization token');
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
    else if(authenticationStatus === 2){
        errorMessage = JSON.stringify('Unauthorized request, please make sure you include correct authorization token');
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
    else{
        const jobPostID : string = req.body.jobID;
        let jobPostTitle : string = req.body.jobTitle;
        const jobPostContent : string = req.body.jobContent;
        const jobCategoryID : string = req.body.categoryID;
        const jobPermitTypeID : string = req.body.permitTypeID;
        const jobLocations : string[] = req.body.locations;
        if(!jobPostID){
            errorMessage = JSON.stringify('Parameter jobID is required to update post');
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }
        
        if(jobLocations){
            if(isStringArray(jobLocations) === false){
                errorMessage = JSON.stringify('Parameter locations need to be in array format');
                res.status(400);
                res.send(errorMessage);
                next();
                return;
            }
        }

        if(jobPostTitle){
            jobPostTitle = jobPostTitle.replace("%20","");
        }

        let checkResult : boolean = false;

        await runTransaction(async query => {
            const checkHasUser = JSON.parse(JSON.stringify(
            await query(`SELECT *
            FROM job_posts
            WHERE id = ?`,[jobPostID])
            ));

            if(checkHasUser[0].length > 0){
                checkResult = true;
            }
        });

        if(checkResult === false){
            errorMessage = JSON.stringify("User not found, please try again");
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }

        try{
            await runTransaction( async query => {  
                let hello = await query(`
                UPDATE job_posts
                SET post_title = COALESCE(?,post_title),
                    post_content = COALESCE(?,post_content),
                    category_id = COALESCE(?,category_id),
                    permit_type_id = COALESCE(?,permit_type_id)
                WHERE id = ?
                `,[jobPostTitle, jobPostContent, jobCategoryID, jobPermitTypeID, jobPostID]);

                if(jobLocations){
                    let result = await query(`
                    DELETE 
                    FROM job_posts_locations
                    WHERE job_post_id = ?`,[jobPostID]); //Delete original job_post_location data

                    await Promise.all(jobLocations.map(async function(item, index){
                        let currentLocationID = jobLocations[index];
                        await query(`
                        INSERT INTO job_posts_locations
                        (job_post_id, location_id)
                        VALUES (?,?)`,[jobPostID, currentLocationID]); //Insert new data to `job_posts_locations` table
                       }));
                }
            });
            res.send(JSON.stringify("Update successfully"));
            next();
        }
        catch(err){
            errorMessage = JSON.stringify("Error occurs when update user, please try again.");
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }
    }
});

//Delete request
app.delete('/jobs/', async function (req : RequestParams, res, next){
    const userAuthenticationToken : string =  req.get('Authorization') as string;

    const authenticationStatus : number = await checkAuthentication(userAuthenticationToken);

    if(authenticationStatus === 3){
        errorMessage = JSON.stringify('Unauthorized request, please make sure you include authorization token');
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
    else if(authenticationStatus === 2){
        errorMessage = JSON.stringify('Unauthorized request, please make sure you include correct authorization token');
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
    else if(authenticationStatus === 1){
        const jobPostID : string = req.body.jobID;
        if(!jobPostID){
            errorMessage = JSON.stringify('jobID is required to delete job post');
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }

        let checkResult : boolean = false;

        await runTransaction(async query => {
            const checkHasUser = JSON.parse(JSON.stringify(
            await query(`SELECT *
            FROM job_posts
            WHERE id = ?`,[jobPostID])
            ));

            if(checkHasUser[0].length > 0){
                checkResult = true;
            }
        });

        if(checkResult === false){
            errorMessage = JSON.stringify("User not found, please try again");
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }

        try{
            await runTransaction(async query => {
                await query(`
                DELETE FROM job_posts 
                WHERE id = ?`,[jobPostID]);
    
                await query(`
                DELETE FROM job_posts_locations
                WHERE job_post_id = ?`,[jobPostID]);
            });

            res.send(JSON.stringify('User id ' + jobPostID + ' is deleted'));
            next();
        }
        catch(err){
            errorMessage = JSON.stringify('Error occurs when delete user, please try again');
            res.status(500);
            res.send(errorMessage);
            next();
            return;
        }
    }
    else{
        errorMessage = JSON.stringify("Unknown authentication error, please check your authentication credentials and try to submit again");
        res.status(500);
        res.send(errorMessage);
        next();
        return;
    }
});

async function runTransaction(queryFunction: TransactionFunction) : Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        
        const connection = await pool.getConnection()
        try {

            await connection.beginTransaction();

            const query = (...params: any[]) => (connection.query as any)(...params )
            
            await queryFunction(query); // Pass query function back to the 'queryFunction' to run the sql query

            await connection.commit()
            
        } catch(err) {
            console.log(err);
            await connection.rollback();
            reject(err);
        }
        resolve();
    });
}


http.createServer(app).listen(3000);
