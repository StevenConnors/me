/*
 This script will accept a directory path, iterate through all the photos & upload them
  
  {
    title: "IMG_1234.jpeg",
    contents: Binary(...)
  }
 */

import { MongoClient, Binary } from 'mongodb'
import fs from 'fs';



const uri = "mongodb+srv://adminUser:adminUser@cluster1.c5stc.mongodb.net/myFirstDatabase?retryWrites=true&w=majority"
const options = {}

let client
let clientPromise

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

await client.connect();
const db = client.db('test');
const col = db.collection('col');

fs.readdir("/Users/stevenconnors/Downloads/ise", (err, files) => {
    files.forEach(file => {
      console.log(file);

      if (file.includes("jpeg")) {

        fs.readFile("/Users/stevenconnors/Downloads/ise/" + file, function(err, imageData) {
            if (!err) {
                
                //when saving an object with an image's byte array
                var imageBson = {};
                //var imageData = fs.readFileSync(imageFile.path);
                imageBson.image = new Binary(imageData);
                imageBson.title = file;
                

                col.insertOne(imageBson, function(err, bsonData) {
                    if (err) {
                        res.end({ msg:'Error saving your file to the database!' });
                    }
                });

                console.log("imageBson: " + JSON.stringify(imageBson));
            }
        });
      }
    });
});

console.log("finished");
