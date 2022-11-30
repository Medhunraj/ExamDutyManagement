const express = require("express");
const bodyParser = require("body-parser");
const app = express();

var mysql = require('mysql');
var connection  = require('./lib/database');

var loggedInUsers = {}

app.set("view engine","ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/images'));



app.get("/",(req,res) => {
    if(req.socket.remoteAddress in loggedInUsers){
        connection.query(
            "SELECT `admin` FROM `users` WHERE `sno`="+loggedInUsers[req.socket.remoteAddress]["id"],
            function(err,result){ 
                staffs_ = [],halls_ = [];
                if(result[0].admin == 1){
                    connection.query(
                        "SELECT * FROM `users` WHERE `admin`=0",
                        function(err,result){
                            staffs_ = result;
                            connection.query(
                                "SELECT * FROM `halls`",
                                function(err,result){
                                    halls_ = result;
                                    connection.query(
                                        "SELECT * FROM `examduty`",
                                        function(err,result){
                                            res.render("admin",{username:loggedInUsers[req.socket.remoteAddress]["username"],staffs:staffs_,halls:halls_,exams:result});
                                        }
                                    );
                                }
                            );
                        }
                    );
                }else{
                    connection.query(
                        "SELECT `datetime` FROM `biometric` WHERE `staff_id`="+loggedInUsers[req.socket.remoteAddress]["id"],
                        function(err,result){
                            bioMA = [0,0];
                            for(let res = 0;res<result.length;res++){
                                keptAt = new Date(result[res]["datetime"])
                                morningStart = new Date();morningStart.setHours(7,30);
                                morningEnd = new Date();morningEnd.setHours(8,45);
                                AfternoonStart = new Date();AfternoonStart.setHours(12,15);
                                AfternoonEnd = new Date();AfternoonEnd.setHours(13,30);

                                if( keptAt > morningStart && keptAt < morningEnd ){
                                    bioMA[0] = 1;
                                }else if( keptAt > AfternoonStart && keptAt < AfternoonEnd ){
                                    bioMA[1] = 1;
                                }
                                //console.log(keptAt,morningStart,morningEnd, keptAt>morningStart,keptAt<morningEnd, keptAt > AfternoonStart , keptAt < AfternoonEnd,bioMA);
                            }
                            connection.query(
                                "SELECT * FROM `examduty`",
                                function(err,result){
                                    let exams_ = result;
                                    connection.query(
                                        "SELECT * FROM `allotment` WHERE `staff_id`="+loggedInUsers[req.socket.remoteAddress]["id"],
                                        function(err,result){
                                            res.render("user",{userid:loggedInUsers[req.socket.remoteAddress]["id"],username:loggedInUsers[req.socket.remoteAddress]["username"],biometric:bioMA,exams:exams_,allotments:result});
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            }
        )
    }else{
        res.redirect("/login");
    }
}); 

app.post("/",(req,res) => {
    if("logout" in req.body){
        delete loggedInUsers[req.socket.remoteAddress];
        res.redirect("/login");
        return;
    }

    if("createExamDuty" in req.body){
        connection.query(
            "INSERT INTO `examduty`(`exam_id`,`exam_title`,`exam_date`,`exam_time`,`staffs`,`halls`) VALUES ("+req.body["id"]+",'"+req.body["title"]+"','"+req.body["datetime"]+"',"+req.body["examtime"]+",'"+req.body["staffs[]"]+"','"+req.body["halls[]"]+"')", 
            function (err, result) {if (err){throw err;}}
        );
        res.redirect("/");
    }
}); 



app.get("/biometric",(req,res) => {
    connection.query("SELECT `sno`,`username` FROM `users` WHERE `admin`=0", function (err, result, fields) {
        if (err) throw err;
        res.render("biometric",{staffs:result});
    });
});

app.post("/biometric",(req,res) => {
    let date = new Date();
    if("biometricMorning" in req.body){
        date.setHours(8,15);
    }else if("biometricAfternoon" in req.body){
        date.setHours(13,10);
    }
    
    connection.query(
        "INSERT INTO `biometric`(`staff_id`, `datetime`) VALUES ('"+req.body.staff+"','"+date.toISOString()+"')", 
        function (err, result) {if (err){throw err;}}
    );

    connection.query(
        "SELECT * FROM `examduty`", 
        function (err, result) {
            if (err){throw err;}
            let exams = result;
            let userid = req.body.staff; 
            let staffs = [];let userindutyFlag = 0;
            morningStart = new Date();morningStart.setHours(7,30);
            morningEnd = new Date();morningEnd.setHours(8,45);
            AfternoonStart = new Date();AfternoonStart.setHours(12,15);
            AfternoonEnd = new Date();AfternoonEnd.setHours(13,30);

            for(var i = 0; i < exams.length; i++){

                if( new Date(exams[i]["exam_date"]).getDate() != date.getDate() || new Date(exams[i]["exam_date"]).getMonth() != date.getMonth() )continue;
                staffs = exams[i]["staffs"].split(',');userindutyFlag=0;for(var j = 0; j < staffs.length; j++){ if(parseInt(staffs[j]) == userid){userindutyFlag = 1;break;}}

                if(userindutyFlag == 1){
                    var halls = exams[i]["halls"].split(",");var index = -1;
                    if(date > morningStart && date < morningEnd){
                        if(exams[i]["exam_time"] == 0){
                            index = Math.floor(Math.random() * halls.length);
                        }else{index = -2;}
                    }else if(date > AfternoonStart && date < AfternoonEnd){
                        if(exams[i]["exam_time"] == 1){
                            index = Math.floor(Math.random() * halls.length);
                        }else{index = -2;}
                    }else{
                        console.log("Not Kept On Time Error");
                        return;
                    }
                    
                    if(index == -1){
                        console.log("No Halls Available ",halls);
                        return;
                    }else if(index == -2){
                        console.log("Wrong Time Exam exam_time:",exams[i]["exam_time"]);
                        return;
                    }

                    connection.query(
                        "SELECT hall_name from halls where hall_id = "+halls[index],
                        function (err, result){
                            let hall_name = result[0]["hall_name"];
                            connection.query(
                                "INSERT INTO `allotment`(`staff_id`, `hall_name`, `exam_id`) VALUES ('"+req.body.staff+"','"+hall_name+"','"+exams[i]["exam_id"]+"')", 
                                function (err, result) {
                                    if (err){throw err;}
                                    
                                    staffs.splice(staffs.indexOf(req.body.staff.toString()),1);
                                    halls.splice(index,1);
                                    connection.query("UPDATE `examduty` SET staffs = '"+staffs+"', halls = '"+halls+"' WHERE exam_id = "+exams[i]["exam_id"],function(err,result){});
                                }
                            );
                        }
                    );
                    return;
                }
            }
        }
    );
    
    res.redirect("/");
});



app.get("/login",(req,res) => {
    res.render("login",{error:false,message:'',signType:''});
});

app.post("/login",(req,res) => {
    if("login" in req.body){
        connection.query("SELECT `sno`,`username`,`password` FROM `users` WHERE `username`=\""+req.body.username+"\"", function (err, result, fields) {
            if (err) throw err;
            if(result.length != 0){
                if(req.body.password != result[0].password){
                    res.render("login",{error:true,message:"Password Is InCorrect",signType:"Login"});
                    return;
                }
                loggedInUsers[req.socket.remoteAddress] = {id:result[0].sno,username:req.body.username};
                res.redirect("/");
            }else{
                res.render("login",{error:true,message:"Username Is Invalid",signType:"Login"});
            }
        });
    }
    
    if("register" in req.body){
        connection.query("SELECT `sno`,`username` FROM `users` WHERE `username`=\""+req.body.username+"\"", function (err, result, fields) {
            if (err) throw err;
            if(result.length == 0){
                let max = 0;
                connection.query("INSERT INTO `users`(`username`, `password`) VALUES ('"+req.body.username+"','"+req.body.password+"')", function (err, result) {if (err) throw err;});
                connection.query("SELECT MAX(`sno`) FROM `users`",function(err,result){ if(result.length == 0){max = 1}else{max=result[0].sno+1;} })
                loggedInUsers[req.socket.remoteAddress] = {id:max.sno+1,username:req.body.username};
                res.redirect("/");
            }else{
                res.render("login",{error:true,message:"Username Is Already Taken",signType:"Registration"});
            }
        });
    }
});



app.listen(3000, 'localhost', function() {
    console.log('Listening to port:  ' + 3000);
});
//npm run devStart