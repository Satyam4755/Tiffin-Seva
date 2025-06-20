
const mongoose=require('mongoose');
const userSchema=mongoose.Schema({
    profilePicture: String,
    profilePicturePublicId: {
        type: String
    },
    firstName:{
        type:String,
        required:[true,'First name is required'],
        trim:true,
    },
    lastName:String,
    dob:{
        type:Date,
        required:[true,'Date of Birth is required']
    },
    email:{
        type:String,
        required:[true,'Email is required'],
        trim:true,
        unique:true
    },
    password:{
        type:String,
        required:[true,'Password is required'],
    },
    userType:{
        type: String,
        enum:['guest','vender'],
        default:'guest'
    },
    favourites:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:'vender'
    }],
    booked:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:'vender'
    }],
    orders:Number,
})

module.exports=mongoose.model('User',userSchema,'user')//---->model name, schema name, collection name;
