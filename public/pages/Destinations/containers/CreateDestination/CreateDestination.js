/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { Formik } from 'formik';
import {
  EuiSpacer,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
} from '@elastic/eui';
import ContentPanel from '../../../../components/ContentPanel';
import { hasError, isInvalid, required } from '../../../../utils/validate';
import { FormikFieldText, FormikSelect } from '../../../../components/FormControls';
import SubHeader from '../../../../components/SubHeader';
import { formikInitialValues } from './utils/constants';
import { DESTINATION_OPTIONS, DESTINATION_TYPE } from '../../utils/constants';
import { validateDestinationName, validateDestinationType } from './utils/validations';
import { formikToDestination } from './utils/formikToDestination';
import { destinationToFormik } from './utils/destinationToFormik';
import { Webhook, CustomWebhook, Email } from '../../components/createDestinations';
import { SubmitErrorHandler } from '../../../../utils/SubmitErrorHandler';
import { getAllowList } from '../../utils/helpers';
import { backendErrorNotification } from '../../../../utils/helpers';

const destinationType = {
  [DESTINATION_TYPE.SLACK]: (props) => <Webhook {...props} />,
  [DESTINATION_TYPE.CHIME]: (props) => <Webhook {...props} />,
  [DESTINATION_TYPE.CUSTOM_HOOK]: (props) => <CustomWebhook {...props} />,
  [DESTINATION_TYPE.EMAIL]: (props) => <Email {...props} />,
};

class CreateDestination extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      initialValues: formikInitialValues,
      allowList: [],
    };
  }

  async componentDidMount() {
    const { httpClient, location, edit, history } = this.props;

    const allowList = await getAllowList(httpClient);
    this.setState({ allowList });

    let ifSeqNo, ifPrimaryTerm;
    if (edit) {
      // In case user is refreshing in edit mode , redirect them to the destination page.
      // TODO:: Ideally this should fetch the destination from OpenSearch and fill in value
      const destinationToEdit = _.get(location, 'state.destinationToEdit', null);
      if (destinationToEdit) {
        const initialValues = { ...(await destinationToFormik(httpClient, destinationToEdit)) };
        ifSeqNo = destinationToEdit.ifSeqNo;
        ifPrimaryTerm = destinationToEdit.ifPrimaryTerm;
        this.setState({
          initialValues,
          ifSeqNo,
          ifPrimaryTerm,
        });
      } else {
        history.push('/destinations');
      }
    }
  }

  getAllowedDestinationOptions() {
    const { allowList } = this.state;
    return DESTINATION_OPTIONS.filter((option) => allowList.includes(option.value));
  }

  getDestination = async (destinationId) => {
    const { httpClient, history, notifications } = this.props;
    try {
      const resp = await httpClient.get(`../api/alerting/destinations/${destinationId}`);
      if (resp.ok) {
        const ifSeqNo = _.get(resp, 'ifSeqNo');
        const ifPrimaryTerm = _.get(resp, 'ifPrimaryTerm');
        this.setState({
          ifSeqNo,
          ifPrimaryTerm,
        });
      } else {
        // Handle error, show message in case of 404
        backendErrorNotification(notifications, 'get', 'destination', resp.resp);
        history.push(`/destinations`);
      }
    } catch (e) {
      console.log('Unable to get the data');
    }
  };

  handleUpdate = async (requestData, { setSubmitting }) => {
    const {
      httpClient,
      match: {
        params: { destinationId },
      },
      history,
      notifications,
    } = this.props;
    const { ifSeqNo, ifPrimaryTerm } = this.state;
    try {
      const resp = await httpClient.put(`../api/alerting/destinations/${destinationId}`, {
        query: { ifSeqNo, ifPrimaryTerm },
        body: JSON.stringify(requestData),
      });
      if (resp.ok) {
        history.push(`/destinations`);
      } else {
        backendErrorNotification(notifications, 'update', 'destination', resp.resp);
        // Handles stale Destination data.
        setSubmitting(false);
        this.getDestination(destinationId);
      }
    } catch (e) {
      console.log('Unable to update destination', e);
      setSubmitting(false);
    }
  };

  handleCreate = async (requestData, { setSubmitting }) => {
    const { httpClient, history, notifications } = this.props;
    try {
      const resp = await httpClient.post('../api/alerting/destinations', {
        body: JSON.stringify(requestData),
      });
      setSubmitting(false);
      if (resp.ok) {
        history.push(`/destinations`);
      } else {
        backendErrorNotification(notifications, 'create', 'destination', resp.resp);
      }
    } catch (e) {
      setSubmitting(false);
      console.error('Unable to create destination', e);
    }
  };
  // Handle Submit
  handleSubmit = (values, formikBag) => {
    const destinationRequest = formikToDestination(values);
    if (this.props.edit) {
      this.handleUpdate(destinationRequest, formikBag);
    } else {
      this.handleCreate(destinationRequest, formikBag);
    }
  };

  handleCancel = () => {
    const { edit, history } = this.props;
    if (edit) {
      history.goBack();
    } else {
      history.push('/destinations');
    }
  };

  render() {
    const { edit, httpClient, location, notifications } = this.props;
    const { initialValues } = this.state;
    return (
      <div style={{ padding: '25px 50px' }}>
        <Formik
          initialValues={initialValues}
          enableReinitialize={true}
          validateOnChange={false}
          onSubmit={this.handleSubmit}
        >
          {({ values, handleSubmit, isSubmitting, errors, isValid }) => (
            <Fragment>
              <EuiTitle size="l">
                <h1>{edit ? 'Edit' : 'Add'} destination</h1>
              </EuiTitle>
              <EuiSpacer size="m" />
              <ContentPanel title="Destination" titleSize="s" bodyStyles={{ padding: 'initial' }}>
                <div style={{ padding: '0px 10px' }}>
                  <FormikFieldText
                    name="name"
                    formRow
                    fieldProps={{
                      validate: validateDestinationName(
                        httpClient,
                        _.get(location, 'state.destinationToEdit')
                      ),
                    }}
                    rowProps={{
                      label: 'Name',
                      helpText: 'Specify a name of the destination.',
                      style: { paddingLeft: '10px' },
                      isInvalid,
                      error: hasError,
                    }}
                    inputProps={{
                      isInvalid,
                      /* To reduce the frequency of search request,
                      the comprehension 'validateDestinationName()' is only called onBlur,
                      but we enable the basic 'required()' validation onChange for good user experience.*/
                      onChange: (e, field, form) => {
                        field.onChange(e);
                        form.setFieldError('name', required(e.target.value));
                      },
                    }}
                  />
                  <FormikSelect
                    name="type"
                    formRow
                    fieldProps={{
                      validate: validateDestinationType(httpClient, notifications),
                    }}
                    rowProps={{
                      label: 'Type',
                      style: { paddingLeft: '10px' },
                      isInvalid,
                      error: hasError,
                    }}
                    inputProps={{
                      disabled: edit,
                      options: this.getAllowedDestinationOptions(),
                      isInvalid,
                    }}
                  />
                  <EuiSpacer size="m" />
                  <SubHeader title={<h4>Settings</h4>} description={''} />
                  <EuiSpacer size="m" />
                  {destinationType[values.type]({
                    httpClient,
                    values,
                    type: values.type,
                    notifications,
                  })}
                </div>
                <EuiSpacer size="m" />
              </ContentPanel>
              <EuiSpacer />
              <EuiFlexGroup alignItems="center" justifyContent="flexEnd">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty onClick={this.handleCancel}>Cancel</EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton fill onClick={handleSubmit} isLoading={isSubmitting}>
                    {edit ? 'Update' : 'Create'}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
              <SubmitErrorHandler
                errors={errors}
                isSubmitting={isSubmitting}
                isValid={isValid}
                onSubmitError={() =>
                  this.props.notifications.toasts.addDanger({
                    title: `Failed to ${edit ? 'update' : 'create'} the destination`,
                    text: 'Fix all highlighted error(s) before continuing.',
                  })
                }
              />
            </Fragment>
          )}
        </Formik>
      </div>
    );
  }
}

CreateDestination.propTypes = {
  edit: PropTypes.bool,
  httpClient: PropTypes.object.isRequired,
  location: PropTypes.object.isRequired,
  match: PropTypes.object.isRequired,
  notifications: PropTypes.object.isRequired,
};

CreateDestination.defaultProps = {
  edit: false,
};
export default CreateDestination;
