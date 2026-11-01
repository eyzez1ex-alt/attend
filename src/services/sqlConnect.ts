import { executeMutation, executeQuery, mutationRef, queryRef } from 'firebase/data-connect'
import { getAttendanceDataConnect } from './firebase'
import type { ApiError, ApiResult } from './api'

function connectionError(error: unknown): ApiError {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'SQL_CONNECT_ERROR'
  const rawMessage = error instanceof Error ? error.message : ''
  if (code.toLowerCase().includes('unauth') || code.toLowerCase().includes('permission')) {
    return { code, message: 'ليس لديك صلاحية لعرض هذه البيانات أو تعديلها.' }
  }
  return {
    code,
    message: rawMessage || 'تعذر الاتصال بخدمة بيانات Firebase. تحقق من إعداد خدمة SQL Connect وحالة الشبكة.',
  }
}

export async function runQuery<TData, TVariables extends object>(
  operationName: string,
  variables: TVariables,
): Promise<ApiResult<TData>> {
  try {
    const reference = queryRef<TData, TVariables>(getAttendanceDataConnect(), operationName, variables)
    const result = await executeQuery(reference)
    return { data: result.data, error: null }
  } catch (error) {
    return { data: null, error: connectionError(error) }
  }
}

export async function runMutation<TData, TVariables extends object>(
  operationName: string,
  variables: TVariables,
): Promise<ApiResult<TData>> {
  try {
    const reference = mutationRef<TData, TVariables>(getAttendanceDataConnect(), operationName, variables)
    const result = await executeMutation(reference)
    return { data: result.data, error: null }
  } catch (error) {
    return { data: null, error: connectionError(error) }
  }
}
