require('dotenv').config()
const express = require('express')
const cors = require('cors')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6t2ckxo.mongodb.net/?appName=Cluster0`;

const admin = require('firebase-admin')
const port = process.env.PORT || 3000
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const app = express()
// middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://b12-m11-session.web.app',
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
)
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log(token)
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {

    // await client.connect();
    const db = client.db('Local_db')
    const favoriteCollection=db.collection('favorite')
    const mealCollections = db.collection('meals')
    const orderCollection = db.collection('order')
    const paymentCollection = db.collection('payment')
    const usersCollection=db.collection('users')
    const mealCollection = db.collection('meal')
     const reviewCollection = db.collection("reviews");
     const roleRequestsCollection = db.collection("roleRequests");


     app.get('/admin-statistics', verifyJWT, async (req, res) => {
  try {
    const usersCount = await usersCollection.countDocuments()
    const payments = await paymentCollection.find().toArray()
    const orders = await orderCollection.find().toArray()

    const totalPayments = Math.floor(payments.reduce((sum, p) => sum + (p.price || 0), 0))
    const ordersPending = orders.filter(o => o.orderStatus === 'pending').length
    const ordersDelivered = orders.filter(o => o.orderStatus === 'delivered').length

    res.send({
      totalUsers: usersCount,
      totalPayments,
      ordersPending,
      ordersDelivered,
    })
  } catch (err) {
    console.error(err)
    res.status(500).send({ error: 'Failed to fetch statistics' })
  }
})


// POST role request (Be a Chef / Be an Admin)
app.post('/role-requests', verifyJWT, async (req, res) => {
  try {
    const { userName, userEmail, requestType } = req.body
    if (!userName || !userEmail || !requestType) {
      return res.status(400).send({ error: 'All fields are required' })
    }

    const newRequest = {
      userName,
      userEmail,
      requestType,              // chef / admin
      requestStatus: 'pending', // default
      requestTime: new Date().toISOString()
    }

    const result = await roleRequestsCollection.insertOne(newRequest)
    res.send({ message: 'Your request has been sent to the admin', requestId: result.insertedId })
  } catch (err) {
    console.error(err)
    res.status(500).send({ error: 'Failed to send role request' })
  }
})


// GET all role requests
app.get('/role-requests', verifyJWT, async (req, res) => {
  try {
    const requests = await roleRequestsCollection.find().sort({ requestTime: -1 }).toArray()
    res.send(requests)
  } catch (err) {
    console.error(err)
    res.status(500).send({ error: 'Failed to fetch requests' })
  }
})


// PATCH approve request
app.patch('/role-requests/approve/:id', verifyJWT, async (req, res) => {
  try {
    const requestId = req.params.id
    const request = await roleRequestsCollection.findOne({ _id: new ObjectId(requestId) })
    if (!request) return res.status(404).send({ error: 'Request not found' })

    const updateData = {}
    if (request.requestType === 'chef') {
      const chefId = 'chef-' + Math.floor(1000 + Math.random() * 9000)
      updateData.role = 'chef'
      updateData.chefId = chefId
    } else if (request.requestType === 'admin') {
      updateData.role = 'admin'
    }

    await usersCollection.updateOne({ email: request.userEmail }, { $set: updateData })
    await roleRequestsCollection.updateOne({ _id: new ObjectId(requestId) }, { $set: { requestStatus: 'approved' } })
    res.send({ message: 'Request approved successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).send({ error: 'Failed to approve request' })
  }
})

// PATCH reject request
app.patch('/role-requests/reject/:id', verifyJWT, async (req, res) => {
  try {
    const requestId = req.params.id
    await roleRequestsCollection.updateOne({ _id: new ObjectId(requestId) }, { $set: { requestStatus: 'rejected' } })
    res.send({ message: 'Request rejected successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).send({ error: 'Failed to reject request' })
  }
})

// PATCH update user status (Make Fraud)
app.patch('/users/status-update/:email', verifyJWT, async (req, res) => {
  try {
    const email = req.params.email
    const { status } = req.body
    const result = await usersCollection.updateOne({ email }, { $set: { status } })
    res.send({ message: 'User status updated', result })
  } catch (err) {
    console.error(err)
    res.status(500).send({ error: 'Failed to update status' })
  }
})






app.get('/users', verifyJWT, async (req, res) => {
  try {
    const users = await usersCollection.find().toArray()
    res.send(users)
  } catch (err) {
    res.status(500).send({ error: 'Failed to fetch users' })
  }
})


   //  user api
   app.get('/users/role/:email',verifyJWT,async(req,res)=>{
    const email=req.params.email;
    const result=await usersCollection.findOne({email})
    res.send({role:result?.role})
   })

   // Status fetch করার API
app.get('/users/status/:email',verifyJWT,  async (req, res) => {
  try {
    const email = req.params.email
    if (!email) return res.status(400).send({ error: 'Email is required' })

    const user = await usersCollection.findOne({ email })
    if (!user) return res.status(404).send({ error: 'User not found' })

    // Send status
    res.status(200).send({ status: user.status || 'active' }) // default active
  } catch (err) {
    console.error('Error fetching user status:', err)
    res.status(500).send({ error: 'Internal Server Error' })
  }
})




         app.post('/users',async(req,res)=>{
  const userData=req.body;
  userData.created_at= new Date().toISOString()
  userData.last_loggedIn= new Date().toISOString()
  userData.role='customer'
  userData.status='active'
   
  const query={
    email: userData.email

  }
  const alreadyExist=await usersCollection.findOne(query)
  console.log('User Already Exist ---->',!!alreadyExist)
  if(alreadyExist){
    console.log("update user Info")
    const   result= await usersCollection.updateOne(query,{
      $set:{
        last_loggedIn: new Date().toISOString(),
      },
    })
    return res.send(result)
  }
  console.log('Saving new user')
  const result=await usersCollection.insertOne(userData)
  
  res.send(result)
})

app.get('/users/:email', async (req, res) => {
  const email = req.params.email
  const result = await usersCollection.findOne({ email: email }) // ba shorthand: { email }
  res.send(result)
})

    // review api

     app.post("/reviews", async (req, res) => {
  const review = req.body;

  review.foodId = new ObjectId(review.foodId); // important
  review.date = new Date(); // auto date

  const result = await reviewCollection.insertOne(review);
  res.send(result);
});


app.get("/reviews/:foodId", async (req, res) => {
  const foodId = req.params.foodId;

  const result = await reviewCollection
    .find({ foodId: new ObjectId(foodId) })
    .toArray();

  res.send(result);
});

app.get('/my-review/:email', async (req, res) => {
  const email = req.params.email;

  const result = await reviewCollection
    .find({ reviewerEmail: email })
    .toArray();

  res.send(result);
});

// UPDATE review by id
app.put('/my-review/:id', verifyJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const { comment, rating } = req.body;

    if (!comment && !rating) {
      return res.status(400).send({ error: 'Nothing to update' });
    }

    const review = await reviewCollection.findOne({ _id: new ObjectId(id) });
    if (!review) {
      return res.status(404).send({ error: 'Review not found' });
    }

    // Verify ownership
    if (review.reviewerEmail !== req.tokenEmail) {
      return res.status(403).send({ error: 'Forbidden. You cannot edit this review.' });
    }

    const updatedData = {};
    if (comment) updatedData.comment = comment;
    if (rating) updatedData.rating = rating;

    const result = await reviewCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    res.send({ message: 'Review updated successfully', result });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});


// DELETE review by id
app.delete('/my-review/:id', verifyJWT, async (req, res) => {
  try {
    const id = req.params.id;

    // Optional: check if the review belongs to the logged-in user
    const review = await reviewCollection.findOne({ _id: new ObjectId(id) });
    if (!review) {
      return res.status(404).send({ error: 'Review not found' });
    }

    // Verify ownership
    if (review.reviewerEmail !== req.tokenEmail) {
      return res.status(403).send({ error: 'Forbidden. You cannot delete this review.' });
    }

    const result = await reviewCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount > 0) {
      res.send({ message: 'Review deleted successfully' });
    } else {
      res.status(500).send({ error: 'Failed to delete review' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});


  //  favorite
app.post('/favorite', async (req, res) => {
  try {
    const favoriteData = req.body;

    // Check if this meal already exists for this user
    const existing = await favoriteCollection.findOne({
      email: favoriteData.email,
      mealId: favoriteData.mealId
    });

    if (existing) {
      return res.status(400).send({ msg: 'Meal already in favorites' });
    }

    // Insert new favorite
    const result = await favoriteCollection.insertOne(favoriteData);
    res.send({ msg: 'Favorite added successfully', data: result });
    
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to add favorite' });
  }
});

    app.get('/favorite/:email',async(req,res)=>{
      const email=req.params.email;
      const result= await favoriteCollection.find({email}).toArray()
      res.send(result)
    })

    app.delete('/favorite/:id',async(req,res)=>{
       try {
    const id = req.params.id; 
    const result = await favoriteCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount > 0) {
      res.send({ msg: 'Favorite meal deleted successfully' });
    } else {
      res.status(404).send({ msg: 'Meal not found' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to delete favorite' });
  }
    })



    // payment api 
    app.get('/payment',async(req,res)=>{
      const result=await paymentCollection.find().toArray()
      res.send(result)
    })

    app.get('/order-request/:email',async(req,res)=>{
      const email=req.params.email;
      const result=await paymentCollection.find({customer:email}).toArray()
      res.send(result)
    })

    // order here
    app.post('/order', verifyJWT, async (req, res) => {
      const orderData = req.body;
      const result = await orderCollection.insertOne(orderData)
      res.send(orderData)
    })


    app.get('/my-order/:email',verifyJWT, async (req, res) => {
      const email = req.params.email;
      const result = await orderCollection.find({ userEmail: email }).toArray()
      res.send(result)
    })
// order request page api

app.get('/chef-orders/:chefId', async (req, res) => {
  const chefId = req.params.chefId;

  const result = await orderCollection
    .find({ chefId })
    .sort({ orderTime: -1 })
    .toArray();

  res.send(result);
});


app.patch('/order-status/:id', async (req, res) => {
  const id = req.params.id;
  const { orderStatus } = req.body;

  const allowedStatus = ['pending', 'accepted', 'delivered', 'cancelled'];
  if (!allowedStatus.includes(orderStatus)) {
    return res.status(400).send({ message: 'Invalid status' });
  }

  const result = await orderCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { orderStatus } }
  );

  res.send(result);
});



    // meals here
    app.post('/meals', async (req, res) => {
      const mealData = req.body;
      const result = await mealCollections.insertOne(mealData)
      res.send(result)
    })

    
app.get('/meals',verifyJWT, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // default 1
    const limit = parseInt(req.query.limit) || 10; // default 10
    const skip = (page - 1) * limit; // skip previous pages

    // মোট meals
    const totalMeals = await mealCollections.countDocuments();

    // Current page এর meals fetch
    const meals = await mealCollections.find()
      .skip(skip)
      .limit(limit)
      .toArray();

    res.send({
      meals,
      totalMeals,
      totalPages: Math.ceil(totalMeals / limit),
      currentPage: page
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Server Error' });
  }
});


    app.get('/meals/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await mealCollections.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

 app.get('/my-meals/:email', verifyJWT, async (req, res) => {
  try {
    const email = req.params.email;

    if (req.tokenEmail !== email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const result = await mealCollections
      .find({ userEmail: email })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Internal Server Error' });
  }
});

app.delete('/meals/:id', verifyJWT, async (req, res) => {
  const id = req.params.id
  const result = await mealCollections.deleteOne({
    _id: new ObjectId(id),
  })
  res.send(result)
})

app.patch('/meals/:id', verifyJWT, async (req, res) => {
  const id = req.params.id
  const updatedData = req.body
  try {
    const result = await mealCollections.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    )
    res.send(result)
  } catch (err) {
    console.error(err)
    res.status(500).send({ message: 'Failed to update meal' })
  }
})


    // meal here
    app.get('/meal', async (req, res) => {
      const result = await mealCollection.find().toArray()
      res.send(result)
    })
    app.get('/meal/:id', async (req, res) => {
      const id = req.params.id;
      const result = await mealCollection.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // payment
    app.post('/create-checkout-session', verifyJWT, async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {

            price_data: {
              currency: 'usd',
              product_data: {
                name: paymentInfo?.mealName,
              },
              unit_amount: paymentInfo?.price * 100,
            },
            quantity: paymentInfo?.quantity,
          },
        ],
        customer_email: paymentInfo.customer.email,
        mode: 'payment',
        metadata: {
          orderId: paymentInfo?.orderId,
          customer: paymentInfo?.customer.email,

        },
        success_url: `http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `http://localhost:5173/dashboard/my-orders`
      });

      res.send({ url: session.url })
    });

    // app.post('/payment-success', async (req, res) => {
    //   const { sessionId } = req.body
    //   const session = await stripe.checkout.sessions.retrieve(sessionId);
    //   const order = await orderCollection.findOne({
    //     _id: new ObjectId(session.metadata.orderId)
    //   })
    //   const payment = await paymentCollection.findOne({ transactionId: session.payment_intent })
    //   if (session.status == 'complete' && order && !payment) {
    //     // save order data in db
    //     const orderInfo = {
    //       orderId: session.metadata.orderId,
    //       transactionId: session.payment_intent,
    //       customer:session.metadata.customer,
    //       status: 'pending',
    //       name: order.mealName,
    //       price: session.amount_total / 100,
    //       quantity: 1,
    //       orderTime: order.orderTime,
    //       paymentStatus: 'paid',
    //     }
    //     const result = await paymentCollection.insertOne(orderInfo)
    //   }
    //   res.send(order)
    // })

app.post('/payment-success', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send({ error: "sessionId missing" });
    }

    // Retrieve stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const orderId = session?.metadata?.orderId;
    const transactionId = session?.payment_intent;

    if (!orderId || !transactionId) {
      return res.status(400).send({ error: "Invalid metadata" });
    }

    const orderObjectId = new ObjectId(orderId);

    // Fetch order
    const order = await orderCollection.findOne({ _id: orderObjectId });
    if (!order) {
      return res.status(404).send({ error: "Order not found" });
    }

    // Check if this transaction already saved (prevents duplicate)
    const existingPayment = await paymentCollection.findOne({
      transactionId: transactionId
    });

    if (existingPayment) {
      console.log("⚠ Payment already exists → blocking duplicate");
      
      // Ensure order status is updated
      await orderCollection.updateOne(
        { _id: orderObjectId },
        { $set: { paymentStatus: "paid" } }
      );

      return res.send({ message: "Already processed", order });
    }

    // Build payment object
    const orderInfo = {
      orderId,
      transactionId,
      chefId:order.chefId,
      customer: session.metadata.customer,
      status: 'pending',
      name: order.mealName,
      price: session.amount_total / 100,
      quantity: 1,
      orderTime: order.orderTime,
      paymentStatus: 'paid',
      createdAt: new Date()
    };

    // Insert payment + handle duplicate error safely
    try {
      await paymentCollection.insertOne(orderInfo);
    } catch (err) {
      if (err.code === 11000) {
        console.log("⚠ Duplicate transaction prevented by unique index");
      } else {
        throw err;
      }
    }

    // Update order paymentStatus
    await orderCollection.updateOne(
      { _id: orderObjectId },
      { $set: { paymentStatus: "paid" } }
    );

    res.send({ message: "Payment confirmed", order });

  } catch (error) {
    console.error("Payment Success Error:", error);
    res.status(500).send({ error: "Something went wrong" });
  }
});








    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
