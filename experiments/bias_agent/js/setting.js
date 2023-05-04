/*
 * TODO (erikb)
 * - Simulations: calculate *actual* accuracy of biased agents (how bad are they?)
 *
 */


// Define experiment metadata object
function Experiment () {
  this.type = 'intuitive-physics';
  this.dbname = 'physics_trust_agent';
  this.colname = 'passive'
  // this.iterationName = 'bias_pilot';
  // this.iterationName = 'bias_pilot_external';
  this.iterationName = 'bias_complete';
  this.devMode = false; // Change this to TRUE if testing in dev mode or FALSE for real experiment
}


// Define session metadata object
function Session (stims, ball_corr) {

  // Create raw trials list
  this.trials = _.map(stims, function (stim, i) {
    // Sample paddle placement from distribution with variance `paddle_sigma`
    let noise = generate_new_angle(0, stim.paddle_sigma);
    // make sure noisy paddle location isn't < 0 or > 2pi radians
    let new_rho = stim.paddle_rho + noise;
    if (new_rho > (2 * Math.PI)) {
      new_rho = new_rho - (2 * Math.PI);
    }
    if (new_rho < 0) {
      new_rho = new_rho + (2 * Math.PI);
    }

    return trial = _.extend({}, new Experiment, {
      // scene: 'indoor',
      scene: 'outdoor',
      prompt: "<div class='prevent-select'>\
        <font style='font-size:48px;'>&#8592</font> / \
        <font style='font-size:48px;'>&#8594</font>: \
        MOVE PADDLE &emsp; <code><b>spacebar</b></code>: LAUNCH</div>",
      gravity: {x: 0, y: -10},
      wind: {x: 50, y: 0},
      rho_original: stim.rhos,
      rho: stim.rhos_noise,
      force: stim.Fs,
      theta: 0,
      paddle_rho_original: stim.paddle_rho,
      paddle_sigma: stim.paddle_sigma,
      paddle_noise: noise,
      paddle_rho: new_rho,
      ball: stim.balls,
      ball_corr: ball_corr,
      criticalTrial: stim.criticalTrial,
      agent_cond: stim.condition,
      block: stim.block,
      totalTrials: stims.length,
    })
  }.bind(this))
}


function setupGame() {
  socket.on('onConnected', function(d) {
    // Debugging
    // console.log('Beginning experiment with condition:', d.stims[0].condition);
    // TODO (erikb) make the below a separate function?
    // Initialize all trials to not be critical trials
    _.forEach(d.stims, function(elem) {
      elem.criticalTrial = false;
    });
    // Determine which trial in each block will be the critical trial
    // shuffle order of 8 critical trial clock positions and assign critical trial in each block based on that order
    var criticalTrials = [];
    let trial_rhos = []; // get all unique launch angles
    let all_trials = []; // get launch angles for all trials
    _.forEach(d.stims, function(elem) {
      all_trials.push(elem.rhos);
      if(!trial_rhos.includes(elem.rhos)) trial_rhos.push(elem.rhos);
    });
    // TODO this seems super inefficient...
    const critical_trial_rhos = []; // keep only launch angles not at 0, 90, 180, 270
    for(i in trial_rhos) {
      if(i % 3 != 0) critical_trial_rhos.push(trial_rhos[i]);
    }
    const critical_trial_order = _.shuffle(critical_trial_rhos); // shuffle order of critical trial clock positions
    // find first index of each critical trial clock position in the appropriate trial block for that index
    let nblocks = d.stims[d.stims.length-1].block+1;
    let blockTrials = d.stims.length / nblocks; // NB: assuming this is always an integer...
    for (i in critical_trial_order) {
      var trial_rho = critical_trial_order[i];
      criticalTrials.push(_.indexOf(
        all_trials, trial_rho, fromIndex = i*blockTrials
      ));
    }

    // Set the critical trial in each block
    _.forEach(criticalTrials, function(elem) {
      d.stims[elem].criticalTrial = true;
    });

    // create number of total trials
    var n_other_trials = 3; // consent, colorblind check, survey
    var n_total_trials = d.stims.length+n_other_trials;

    // current number of correct trials
    var correct_trials = 0;

    // get experiment ID information from URL
    var queryString = window.location.search;
    var urlParams = new URLSearchParams(queryString);
    var prolificID = urlParams.get('PROLIFIC_PID')   // ID unique to the participant
    var studyID = urlParams.get('STUDY_ID')          // ID unique to the study
    var sessionID = urlParams.get('SESSION_ID')      // ID unique to the particular submission

    /* create timeline */
    var seq = [];



    // at end of each trial save data locally and send data to server
    var main_on_finish = function(data) {
      data.eventType = 'trials';
      socket.emit('currentData', data);
      // console.log('emitting data', data);
    }

    // at end of each trial save data locally and send data to server
    // var final_on_finish = function(data) {
    //   // console.log('data:', data);
    //   // at the end of each trial, update the progress bar
    //   // based on the current value and the proportion to update for each trial
    //   var curr_progress_bar_value = jsPsych.getProgressBarCompleted();
    //   jsPsych.setProgressBar(curr_progress_bar_value + (1/n_total_trials));
    //   socket.emit('currentData', data);
    // }

    // TRUST AGENT INSTRUCTIONS
    var instructionsHTML = {
      'str1': [
        "<div class='prevent-select'>\
          <p>\
            Here's how this game is going to work:\
	          Each round, you'll be moving a red paddle around a circle to catch a ball.\
          </p>\
	        <div><img src='image/trial-overview.gif' width='400'></div>\
	        <p>\
            Your job is to try and catch the ball as often as you can.\
          </p>\
        </div>"
      ],
      'str2': [
	      "<div class='prevent-select'>\
          <p>\
            To help you out, you'll be joined by a <font style='color: rgb(167, 125, 216); font-size: 32px;'>\
            <b>robot helper</b></font> who is also trying their best to catch the ball.\
          </p>\
	        <div><img src='image/purple-agent.png' width='150'></div>\
	        <p>\
            At the beginning of each round, the robot will suggest a paddle position where it thinks\
            the ball will land.\
          </p> \
          <p>\
            When the robot has made up its mind, it will turn \
            <font style='color: rgb(3, 171, 180); font-size: 32px;'><b>blue</b></font>\
            and then it'll be your turn to decide what to do.\
          </p>\
	        <div><img src='image/trial-suggest.gif' width='600'></div>\
        </div>"
      ],
      'str3': [
	      "<div class='prevent-select'>\
          <p>\
            If you agree with the robot's suggestion, press the <code>spacebar</code> to lock the \
            paddle location and launch the ball.\
          </p>\
          <div><img src='image/trial-accept.gif' width='600'></div>\
	        <p>\
            Before launching the ball, you can also tweak the paddle location yourself </br>\
	          using the &#8592 and &#8594 arrow keys. Then press the <code>spacebar</code> to launch \
            the ball when you're ready.\
          </p>\
	        <div><img src='image/trial-reject.gif' width='600'></div>\
        </div>"
      ],
      // New instructions for bias condition (erikb)
      'str4': [
        "<div class='prevent-select'>\
          <p>\
            Watch out! Every so often there will be \
            <font style='color: rgb(142, 214, 255); font-size: 32px;'>Mystery Rounds</font>, where \
            the ball's launch location will be hidden from view.\
          </p>\
          <p>\
            However, the robot will still see the ball's starting location, so it will make a \
            suggestion about where to place the paddle.\
          </p>\
          <div><img src='image/trial-mystery.gif' width='600'></div>\
          <p>\
            Even though you can't see where the ball is being launch from on these trials, \
            try your best to catch the ball anyway!\
          </p>\
        </div>"
      ],
    };

    // add consent pages
    consentHTML = {
      'str1': [
        "<div class='prevent-select'>\
          <p id='legal'><u>Welcome!</u></p></div>",
        "<div class='prevent-select'>\
          <p id='legal'>In this experiment, you will play a game of virtual catch!</p>\
          <p>We expect this study to take approximately 20 to 30 minutes to complete, \
            including the time it takes to read these instructions.</p></div>"
      ].join(' '),
      'str2': [
        "<div class='prevent-select'>\
          <p id='legal'><u>Consent to Participate</u></p></div>",
        "<div class='prevent-select' style='text-align:left'>\
          <p id='legal'>By completing this study, you are participating in a \
            study being performed by cognitive scientists in the UC San Diego \
            Department of Psychology. The purpose of this research is to find out\
            how people understand their physical environment. \
            You must be at least 18 years old to participate. There are neither\
            specific benefits nor anticipated risks associated with participation\
            in this study. Your participation in this study is completely voluntary\
            and you can withdraw at any time by simply exiting the study. You may \
            decline to answer any or all of the following questions. Choosing not \
            to participate or withdrawing will result in no penalty. Your anonymity \
            is assured; the researchers who have requested your participation will \
            not receive any personal information about you, and any information you \
            provide will not be shared in association with any personally identifying information.\
          </p>\
          <p>If you have questions about this research, please contact the researchers by sending \
            an email to \
            <b><a href='mailto://cogtoolslab.requester@gmail.com'>\
              cogtoolslab.requester@gmail.com\
            </a></b>. \
            These researchers will do their best to communicate with you in a timely, \
            professional, and courteous manner. If you have questions regarding your \
            rights as a research subject, or if problems arise which you do not feel \
            you can discuss with the researchers, please contact the UC San Diego \
            Institutional Review Board.\
          </p>\
        </div>\
        <div class='prevent-select'>\
          <p>Click 'Next' to continue participating in this study.</p>\
        </div>"
      ].join(' '),
      'str3':
        "<div class='prevent-select'>\
          <p>\
            Two final notes. First, we recommend using Chrome for this study, as it can be \
            buggy in other browsers.\
          </p>\
          <p>\
            Second, please keep your browser maximized for the duration of this study.\
          </p> \
          <p>\
            If you encounter a problem or error, send us an email (cogtoolslab.requester@gmail.com) \
            and we will make sure you are compensated for your time!\
          </p> \
          <p>Please pay attention and do your best! Thank you!</p>\
        </div>"
    };

    //combine instructions and consent
    var introMsg = {
      type: 'instructions',
      allow_keys: false,
      allow_backward: true,
      pages: [
        consentHTML.str1,
        consentHTML.str2,
        instructionsHTML.str1,
        instructionsHTML.str2,
        instructionsHTML.str3,
        instructionsHTML.str4,
        consentHTML.str3
      ],

      show_clickable_nav: true,
      allow_backward: true,
    };
    seq.push(introMsg);

    var enter_fullscreen = {
      type: 'fullscreen',
      fullscreen_mode: true,
      message: "<div class='prevent-select'>\
        <p>The experiment will switch to fullscreen mode when you press the button below.<p></div>"
    };
    seq.push(enter_fullscreen);

    var feedback = {
      type: 'feedback',
      stimulus: function(){
          return "<div class='prevent-select'><p style='font-size:30px;'>\
            Press space to continue to the next trial.</p></div>";
      },
      choices: [' '],
      finishedTrials: function (){
          return (jsPsych.data.get().last(1).values()[0].trialInd + 1);
      },
      curr_correct_trials: function (){
          var last_trial_correct = jsPsych.data.get().last(1).values()[0].correct;
          correct_trials += (last_trial_correct ? 1: 0);
          return correct_trials;
      },
      on_finish: function() {
        // at the end of each trial, update the progress bar
        // based on the current value and the proportion to update for each trial
        var curr_progress_bar_value = jsPsych.getProgressBarCompleted();
        jsPsych.setProgressBar(curr_progress_bar_value + (1/n_total_trials));
      }
    };

    var corr = [1,2,3];
    var ball_corr = jsPsych.randomization.repeat(corr, 1);

    // add additional info to create trial list
    var additionalInfo = {
      gameID: d.gameid,
      prolificID : prolificID,
      studyID : studyID,
      sessionID : sessionID,
      //SONA_ID: SONA_ID,
      on_finish: main_on_finish
    }

    var stims = shuffle_within_group(d.stims, 'block');
    var blocks = _.groupBy(stims, function(elem){ return elem.block; });
    // Ensure that critical trials are in second half of each block
    stims = [];
    for(idx in blocks) {
      var blockElems = blocks[idx];
      for(i in blockElems.slice(0, 6)) {
        if(blockElems[i].criticalTrial) {
          // If first critical trial is in first half of block,
          // swap critical trial with random element in second half of block 1
          var swapIdx = _.random(6, 11);
          var swap = blockElems[swapIdx];
          blockElems[swapIdx] = blockElems[i];
          blockElems[i] = swap;
        }
      }
      stims = stims.concat(blockElems);
    }

    // stims[0].criticalTrial = true; // DEBUGGING set first trial as critical trial
    // stims = []; // DEBUGGING go straight to survey

    // Create trial list
    var session = new Session(stims, ball_corr);
    var trials = _.flatten(_.map(session.trials, function(trialData, i) {
      var trial = _.extend({}, additionalInfo, trialData, {trialInd: i});
      return trial;
    }));


    // build timeline
    // add feedback to each trial
    for (i = 1; i <= trials.length; i +=2) {
      trials.splice(i, 0, feedback);
    }

    seq = _.concat(seq, trials);
    // seq.unshift(enter_fullscreen)

    // survey
    // html elements for survey questions

    // demographic questions
    // age
    var age_html = '<div class="prevent-select">\
      <p>Age:&emsp;&emsp;&emsp;&emsp;&emsp;<input name="age" type="number" min=18 required/></p></div>';
    // age_html += '<datalist id="skip"><option value="Prefer Not to Say"></datalist></p>';
    // gender
    var gender_list = '<div class="prevent-select">\
      <p><label for="gender">Gender:&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;</label>';
    gender_list += '<select id="gender" name="gender" required>';
    gender_list += '<option disabled selected></option>';
    gender_list += '<option value="Male">Male</option>';
    gender_list += '<option value="Female">Female</option>';
    gender_list += '<option value="Non-binary">Non-binary</option>';
    gender_list += '<option value="Prefer Not to Say">Prefer Not to Say</option></select></p></div>';
    // education level
    var edu_list = '<div class="prevent-select">\
      <p><label for="edu">Education Level:&nbsp;&emsp;&emsp;</label>';
    edu_list += '<select id="edu" name="edu" required>';
    edu_list += '<option disabled selected></option>';
    edu_list += '<option value="high school">High School</option>';
    edu_list += '<option value="2-year college">2-Year College</option>';
    edu_list += '<option value="4-year college">4-Year College</option>';
    edu_list += '<option value="graduate school">Graduate School</option>';
    edu_list += '<option value="post graduate">Post Graduate</option>';
    edu_list += '<option value="Prefer Not to Say">Prefer Not to Say</option></select></p></div>';
    // number of physics classes taken
    var class_list = '<div class="prevent-select">\
      <p>How many physics classes have you taken?&nbsp;\
      <input name="physics class number" type="number" min=0 required/></p></div>';
    // video game questions
    // hours played in the past month
    var vg1_list = '<div class="prevent-select">\
      <p><label for="vg1">About how many hours have you played video games in the past month&nbsp;&nbsp;</label>';
    vg1_list += '<select id="vg1" name="vg1" required>';
    vg1_list += '<option disabled selected></option>';
    vg1_list += '<option value="0">0</option>';
    vg1_list += '<option value="0-1">0-1</option>';
    vg1_list += '<option value="1-5">1-5</option>';
    vg1_list += '<option value="5-10">5-10</option>';
    vg1_list += '<option value="10-20">10-20</option>';
    vg1_list += '<option value="20+">20+</option></select></p></div>';

    // hours played since the start
    var vg2_list = '<div class="prevent-select">\
      <p><label for="vg2">About how many hours have you played video games in your life?&emsp;&emsp;&nbsp;</label>';
    vg2_list += '<select id="vg2" name="vg2" required>';
    vg2_list += '<option disabled selected></option>';
    vg2_list += '<option value="0">0</option>';
    vg2_list += '<option value="0-10">0-10</option>';
    vg2_list += '<option value="10-100">10-100</option>';
    vg2_list += '<option value="100-1000">100-1000</option>';
    vg2_list += '<option value="1000-5000">1000-5000</option>';
    vg2_list += '<option value="5000+">5000+</option></select></p></div>';


    // experiment survey questions

    // ask about subjective intervention rate
    var participant_subjective_intervention_html = "<div class='prevent-select'>\
      In the previous game rounds, roughly how often did you change the robot's paddle location?</div>";
    participant_subjective_intervention_html += '<div class="prevent-select">0%\
      <input style="width: 50%" type="range" id="intervene_rate" name="intervene_rate" min="0" max="100" value="0" required>\
      <label for="intervene_rate" checked>100%</label></div><br>';

    // ask about expected intervention rate
    var participant_future_expectation_html = "<div class='prevent-select'>\
      If you were to play another 96 rounds with the same robot, how often would you expect to \
      change the robot's paddle location?</div>";
    participant_future_expectation_html += '<div class="prevent-select">0%\
      <input style="width: 50%" type="range" id="expected_intervene_rate" name="expected_intervene_rate" min="0" max="100" value="0" required>\
      <label for="expected_intervene_rate" checked>100%</label></div><br>';

    // TODO ask about subjective intervention rate *on critical trials*?


    // ask about agent's competence
    var participant_agent_competence_html = '<div class="prevent-select">\
      Overall, how much do you trust this robot to catch the ball on any given round?</div>';
    participant_agent_competence_html += '<div class="prevent-select"><input type="radio" id="notCompetent" name="agent_competence" value="notCompetent" required><label for="notCompetent" checked>Not at all</label>';
    participant_agent_competence_html += '&emsp;<input type="radio" id="slightlyCompetent" name="agent_competence" value="slightlyCompetent"><label for="slightlyCompetent" checked>Slightly</label>';
    participant_agent_competence_html += '&emsp;<input type="radio" id="moderatelyCompetent" name="agent_competence" value="moderatelyCompetent"><label for="moderatelyCompetent" checked>Moderately</label>';
    participant_agent_competence_html += '&emsp;<input type="radio" id="veryCompetent" name="agent_competence" value="veryCompetent"><label for="veryCompetent" checked>Very</label>';
    participant_agent_competence_html += '&emsp;<input type="radio" id="extremelyCompetent" name="agent_competence" value="extremelyCompetent"><label for="extremelyCompetent" checked>Extremely</label></div><br>';

    // ask about effort
    var participant_effort_html = '<div class="prevent-select">\
      How much effort did you put into the game? Your response will not effect your final compensation.</div>';
    participant_effort_html += '<div class="prevent-select"><input type="radio" id="minorEffort" name="participantEffort" value="minorEffort" required><label for="minorEffort" checked>Very little effort</label>';
    participant_effort_html += '&emsp;<input type="radio" id="moderateEffort" name="participantEffort" value="moderateEffort"><label for="moderateEffort" checked>Moderate effort</label>';
    participant_effort_html += '&emsp;<input type="radio" id="majorEffort" name="participantEffort" value="majorEffort"><label for="majorEffort" checked>A lot of effort</label></div><br>';

    // question about responding on critical trials
    var critical_trial_strategy_html = "<div class='prevent-select'>\
      <p>How did you decide where to place the paddle on Mystery Rounds?</p>";
    critical_trial_strategy_html += '<p><textarea id="critical-trial-strategy" name="critical-trial-strategy" rows="4" cols="80" required></textarea></p></div>';

    // question about strategies used on non-critical trials
    var strategy_html = "<div class='prevent-select'>\
      <p>On normal rounds (not Mystery Rounds), how did you decide whether to change the robot's paddle location?</p>";
    strategy_html += '<p><textarea id="strategy" name="strategy" rows="4" cols="80" required></textarea></p></div>';


    // question about technical issues
    var technical_html = "<div class='prevent-select'>\
      <p>Did you encounter any technical issues? If so, can you please decribe them?</p>";
    technical_html += '<p><textarea id="technical" name="technical" rows="4" cols="80"></textarea></p></div>';
    // set up page for demographic survey
    // var demographicSurveyInfo = _.omit(_.extend({}, additionalInfo, new Experiment),['type','devMode']);
    var final_on_finish = function(data) {
      // at the end of each trial, update the progress bar
      // based on the current value and the proportion to update for each trial
      var curr_progress_bar_value = jsPsych.getProgressBarCompleted();
      jsPsych.setProgressBar(curr_progress_bar_value + (1/n_total_trials));
      data.gameID = d.gameid;
      data.prolificID = prolificID;
      data.studyID = studyID;
      data.sessionID = sessionID;
      data.eventType = 'survey_data';
      // data.iterationName = 'bias_pilot_external'; // TODO set these vals using `Experiment` object initialized at top
      // data.iterationName = 'bias_pilot';
      data.iterationName = 'bias_complete';
      data.dbname = 'physics_trust_agent';
      data.colname = 'passive';
      socket.emit('currentData', data);
    }
    var demographic_survey = {
      type: 'survey-html-form',
      preamble: '<div class="prevent-select">\
        <p><b>Thank you for completing the experiment! \
        Please answer the following demographic questions:</b></p></div>',
      html:  age_html + gender_list + edu_list + class_list + vg1_list + vg2_list,
      on_finish: final_on_finish
    //   html:  test_list
    };

    // var demographic_survey = _.extend( {}, demographicSurveyInfo, {
    //   type: 'survey-html-form',
    //   eventType: 'survey',
    //   preamble: '<p> Thank you for completing the experiment, please answer the following demographic questions: </p>',
    //   html:  age_html + gender_list + edu_list + class_list + vg1_list + vg2_list,
    //   on_finish: final_on_finish
    // //   html:  test_list
    // });
    // console.log(demographic_survey);
    seq.push(demographic_survey);

    // set up page for experiment related survey
    // var strategySurveyInfo = _.omit(_.extend({}, additionalInfo, new Experiment),['type','devMode']);
    // var strategy_survey = _.extend( {}, strategySurveyInfo, {
    //   type: 'survey-html-form',
    //   eventType: 'survey',
    //   preamble: '<p> Please answer the following questions about the experiment. </p>',
    //   html:  participant_subjective_intervention_html + participant_future_expectation_html + participant_agent_competence_html + participant_effort_html + strategy_html,
    //   on_finish: final_on_finish
    // });
    var strategy_survey = {
      type: 'survey-html-form',
      preamble: '<div class="prevent-select">\
        <p><b>Please answer the following questions about the experiment:</b></p></div>',
      html:  participant_subjective_intervention_html + participant_future_expectation_html + participant_agent_competence_html + participant_effort_html + critical_trial_strategy_html + strategy_html + technical_html,
      on_finish: final_on_finish
    };
    seq.push(strategy_survey);

    var goodbye_trial = {
      type: 'instructions',
      pages: [
        "<div class='prevent-select'>\
          <p>Congrats! You are all done. Thanks for participating in our game!</p>\
          <p>\
            Click Next to submit this study to Prolific. After you click Next, you will see a \
            blank page on this web page but will be redirected to the Prolific homepage. \
            This means that your participation has been logged. \
            If you do not receive credit immediately, please wait a few days.\
          </p>\
        </div>"
      ],
      show_clickable_nav: true,
      allow_backward: false,
      delay: false,

      on_finish: function() {
        window.onbeforeunload = null; // prevent warning message on redirect (erikb)
        // window.open('https://app.prolific.co/submissions/complete?cc=C1EIRG9A', '_self') // pilot
        window.open('https://app.prolific.co/submissions/complete?cc=C148ZKPN', '_self') // full study
      }
    };
    seq.push(goodbye_trial);

    jsPsych.init({
      timeline: seq,
      show_progress_bar: true,
      auto_update_progress_bar: false
    });

  }); // close onConnected
} // close setup game

// https://newbedev.com/javascript-math-random-normal-distribution-gaussian-bell-curve
function randn_bm() {
  var u = 0, v = 0;
  while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

function generate_new_angle(rho, sigma) {
  return randn_bm() * sigma + rho;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function groupBy(iterable, keyFn = obj => obj) {
  const groups = new Map();
  for (const item of iterable) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function shuffle_within_group(arr, group) {
  let groups = groupBy(arr, obj => obj[group]);
  groups = Array.from(groups.values());
  groups2 = [];
  i = 0;
  for (group of groups) {groups2[i] = _.shuffle(group); i++}
  return groups2.flat();
}
