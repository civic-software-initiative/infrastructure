import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { BucketEncryption, BucketAccessControl, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import {
  ViewerCertificate,
  ViewerProtocolPolicy,
  HttpVersion,
  PriceClass,
  OriginAccessIdentity,
} from 'aws-cdk-lib/aws-cloudfront';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';

export class CsiInfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // TODO: real domain name
    const DOMAIN_NAME = 'sexytaxes.org';
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
    cloudfrontUserAccessPolicy.addPrincipals(accessIdentity.grantPrincipal);
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

    const ROOT_INDEX_FILE = 'index.html';
    const cfDist = new cloudfront.CloudFrontWebDistribution(this, 'CfDistribution', {
      comment: 'CSI Site Cloudfront Distro',
      viewerCertificate: ViewerCertificate.fromAcmCertificate(cert, {
        aliases: [DOMAIN_NAME, WWW_DOMAIN_NAME],
      }),
      defaultRootObject: ROOT_INDEX_FILE,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      httpVersion: HttpVersion.HTTP2,
      priceClass: PriceClass.PRICE_CLASS_100,
      originConfigs: [
        {
          s3OriginSource: {
            originAccessIdentity: accessIdentity,
            s3BucketSource: siteBucket,
          },
          behaviors: [
            {
              compress: true,
              isDefaultBehavior: true,
            },
          ],
        },
      ],
      // Handle errors within site
      errorConfigurations: [
        {
          errorCachingMinTtl: 300, // in seconds
          errorCode: 403,
          responseCode: 200,
          responsePagePath: `/${ROOT_INDEX_FILE}`,
        },
        {
          errorCachingMinTtl: 300, // in seconds
          errorCode: 404,
          responseCode: 200,
          responsePagePath: `/${ROOT_INDEX_FILE}`,
        },
      ],
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
