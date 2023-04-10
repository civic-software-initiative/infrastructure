import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { BucketEncryption, BucketAccessControl, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import {
  PriceClass,
  OriginAccessIdentity,
} from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';

export class CsiInfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // TODO: real domain name
    const DOMAIN_NAME = 'csi.vengal.dev';
    const WWW_DOMAIN_NAME = `www.${DOMAIN_NAME}`;

    const siteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    const accessIdentity = new OriginAccessIdentity(this, 'CloudfrontAccess');
    const cloudfrontUserAccessPolicy = new PolicyStatement();
    cloudfrontUserAccessPolicy.addActions('s3:GetObject');
    cloudfrontUserAccessPolicy.addPrincipals(
      new iam.CanonicalUserPrincipal(accessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId)
    );
    cloudfrontUserAccessPolicy.addResources(siteBucket.arnForObjects('*'));
    siteBucket.addToResourcePolicy(cloudfrontUserAccessPolicy);

    // This step will block deployment until you add the relevant CNAME records through your domain registrar
    // Make sure you visit https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1#/certificates
    // to check the CNAME records that need to be added
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront-readme.html#domain-names-and-certificates
    const cert = new acm.Certificate(this, 'WebCert', {
      domainName: WWW_DOMAIN_NAME,
      subjectAlternativeNames: [DOMAIN_NAME],
      validation: CertificateValidation.fromDns(),
    });

    const cfFunction = new cloudfront.Function(this, 'CfPathRewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;

          // Check whether the URI is missing a file name.
          if (uri.endsWith('/')) {
            request.uri += 'index.html';
          }
          // Check whether the URI is missing a file extension.
          else if (!uri.includes('.')) {
            request.uri += '/index.html';
          }

          return request;
        }
      `),
      comment: 'Handles issue with cloudfront+astro routing',
      functionName: 'CloudfrontAstroPathRewriteFunction'
    })
    cfFunction.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const cfDist = new cloudfront.Distribution(this, 'CfDistribution', {
      comment: 'CSI Site Cloudfront Distro',
      certificate: cert,
      domainNames: [DOMAIN_NAME, WWW_DOMAIN_NAME],
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, {
          originAccessIdentity: accessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        functionAssociations: [{
          function: cfFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST
        }],
      },
    });

    new CfnOutput(this, 'CfDomainName', {
      value: cfDist.distributionDomainName,
      description: 'Create a CNAME record with name `www` and value of this CF distribution URL',
    });
    new CfnOutput(this, 'S3BucketName', {
      value: `s3://${siteBucket.bucketName}`,
      description: 'Use this with `aws s3 sync` to upload your static website files',
    });
    new CfnOutput(this, 'CfDistId', {
      value: cfDist.distributionId,
      description:
        'Use this ID to perform a cache invalidation to see changes to your site immediately',
    });
  }
}
