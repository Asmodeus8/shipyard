pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '30'))
    timeout(time: 45, unit: 'MINUTES')
  }

  environment {
    ENVIRONMENT    = 'prod'
    ECR_REPOSITORY = 'shipyard-api'
    IMAGE_TAG      = "${env.GIT_COMMIT}"
    CANDIDATE      = "shipyard-ci-${env.BUILD_NUMBER}"
    TRIVY          = 'aquasec/trivy:0.76.1'
    CHECKOV        = 'bridgecrew/checkov:3.4.3'
  }

  stages {
    stage('Verify') {
      parallel {
        stage('Unit tests') {
          steps {
            sh 'docker build --target test -t ${ECR_REPOSITORY}:test app'
          }
        }
        stage('Terraform') {
          steps {
            sh '''
              terraform fmt -check -recursive infra
              for dir in infra/bootstrap infra/stack; do
                terraform -chdir=$dir init -backend=false -input=false >/dev/null
                terraform -chdir=$dir validate
              done
            '''
          }
        }
        stage('IaC scan') {
          steps {
            sh '''
              tar -c .checkov.yaml infra | docker run -i --rm --entrypoint sh ${CHECKOV} \
                -c 'mkdir /repo && cd /repo && tar -x && checkov --config-file .checkov.yaml -d infra'
            '''
          }
        }
      }
    }

    stage('Build image') {
      steps {
        sh 'docker build --build-arg APP_VERSION=${IMAGE_TAG} -t ${ECR_REPOSITORY}:${IMAGE_TAG} app'
      }
    }

    stage('Image scan') {
      steps {
        sh '''
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock ${TRIVY} image --quiet \
            --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 ${ECR_REPOSITORY}:${IMAGE_TAG}
        '''
      }
    }

    stage('Container check') {
      steps {
        sh '''
          docker run -d --name ${CANDIDATE} --read-only ${ECR_REPOSITORY}:${IMAGE_TAG}
          for i in $(seq 1 30); do
            status=$(docker inspect -f '{{.State.Health.Status}}' ${CANDIDATE})
            [ "$status" = healthy ] && break
            [ "$status" = unhealthy ] && { docker logs ${CANDIDATE}; exit 1; }
            sleep 2
          done
          [ "$status" = healthy ] || { echo "container never became healthy"; exit 1; }
          docker exec ${CANDIDATE} node -e "fetch('http://127.0.0.1:8080/api/version').then(r=>r.json()).then(b=>{if(b.version!==process.env.APP_VERSION)process.exit(1)})"
        '''
      }
    }

    stage('Push to ECR') {
      when { branch 'main' }
      steps {
        withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-shipyard']]) {
          sh '''
            ECR_REGISTRY="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.${AWS_REGION}.amazonaws.com"
            aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY"
            ECR_REGISTRY="$ECR_REGISTRY" ./scripts/build-push.sh
          '''
        }
      }
    }

    stage('Deploy') {
      when { branch 'main' }
      steps {
        withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-shipyard']]) {
          sh './scripts/terraform.sh apply ${ENVIRONMENT} ${IMAGE_TAG}'
        }
      }
    }

    stage('Smoke test') {
      when { branch 'main' }
      steps {
        sh './scripts/smoke-test.sh "$(jq -r .service_url.value tf-outputs.json)" ${IMAGE_TAG}'
      }
    }
  }

  post {
    always {
      sh 'docker rm -f ${CANDIDATE} >/dev/null 2>&1 || true'
    }
    success {
      script {
        if (fileExists('tf-outputs.json')) {
          def out = readJSON file: 'tf-outputs.json'
          currentBuild.description = "${env.IMAGE_TAG.take(7)} → ${out.service_url.value}"
        }
      }
    }
    cleanup {
      cleanWs()
    }
  }
}
